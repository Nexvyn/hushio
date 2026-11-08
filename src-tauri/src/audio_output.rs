#![cfg_attr(not(target_os = "macos"), allow(dead_code, unused_imports))]

use serde::Serialize;

#[cfg(target_os = "macos")]
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "audio-output-changed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputState {
    pub default_id: String,
    pub device_ids: Vec<String>,
}

impl OutputState {
    pub fn new(default_id: &str, device_ids: Vec<String>) -> Self {
        let mut device_ids: Vec<String> = device_ids.into_iter().filter(|id| !id.is_empty()).collect();
        device_ids.sort();
        device_ids.dedup();
        Self {
            default_id: default_id.to_owned(),
            device_ids,
        }
    }
}

pub const fn fourcc(code: &[u8; 4]) -> u32 {
    ((code[0] as u32) << 24) | ((code[1] as u32) << 16) | ((code[2] as u32) << 8) | code[3] as u32
}

pub fn changed(last: Option<&OutputState>, next: &OutputState) -> bool {
    last != Some(next)
}

#[tauri::command]
pub fn audio_output_state() -> OutputState {
    snapshot()
}

#[cfg(not(target_os = "macos"))]
fn snapshot() -> OutputState {
    OutputState::new("", Vec::new())
}

#[cfg(target_os = "macos")]
fn snapshot() -> OutputState {
    coreaudio::snapshot()
}

#[cfg(target_os = "macos")]
static APP: OnceLock<AppHandle> = OnceLock::new();

#[cfg(target_os = "macos")]
static LAST: Mutex<Option<OutputState>> = Mutex::new(None);

#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    for selector in [coreaudio::DEVICES, coreaudio::DEFAULT_OUTPUT] {
        if let Err(status) = coreaudio::watch(selector) {
            tracing::warn!(status, "could not watch audio outputs");
        }
    }
}

#[cfg(target_os = "macos")]
fn on_device_change() {
    if let Some(app) = APP.get() {
        emit_if_changed(app);
    }
}

#[cfg(target_os = "macos")]
fn emit_if_changed(app: &AppHandle) {
    let next = snapshot();
    let mut last = LAST.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if !changed(last.as_ref(), &next) {
        return;
    }
    *last = Some(next.clone());
    drop(last);
    if let Err(error) = app.emit(EVENT, &next) {
        tracing::warn!(%error, "could not emit audio output change");
    }
}

#[cfg(target_os = "macos")]
mod coreaudio {
    use std::ffi::{c_char, c_void};
    use std::ptr;

    use super::{OutputState, fourcc};

    type ObjectId = u32;
    type Status = i32;

    #[repr(C)]
    pub struct Address {
        selector: u32,
        scope: u32,
        element: u32,
    }

    pub const DEVICES: u32 = fourcc(b"dev#");
    pub const DEFAULT_OUTPUT: u32 = fourcc(b"dOut");
    const SYSTEM_OBJECT: ObjectId = 1;
    const MAIN_ELEMENT: u32 = 0;
    const GLOBAL_SCOPE: u32 = fourcc(b"glob");
    const OUTPUT_SCOPE: u32 = fourcc(b"outp");
    const DEVICE_UID: u32 = fourcc(b"uid ");
    const STREAMS: u32 = fourcc(b"stm#");
    const UTF8: u32 = 0x0800_0100;

    #[link(name = "CoreAudio", kind = "framework")]
    unsafe extern "C" {
        fn AudioObjectGetPropertyDataSize(
            object: ObjectId,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> Status;
        fn AudioObjectGetPropertyData(
            object: ObjectId,
            address: *const Address,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> Status;
        fn AudioObjectAddPropertyListener(
            object: ObjectId,
            address: *const Address,
            listener: unsafe extern "C" fn(ObjectId, u32, *const Address, *mut c_void) -> Status,
            client: *mut c_void,
        ) -> Status;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringGetLength(string: *const c_void) -> isize;
        fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
        fn CFStringGetCString(string: *const c_void, buffer: *mut c_char, size: isize, encoding: u32) -> u8;
        fn CFRelease(value: *const c_void);
    }

    fn address(selector: u32, scope: u32) -> Address {
        Address {
            selector,
            scope,
            element: MAIN_ELEMENT,
        }
    }

    fn data_size(object: ObjectId, address: &Address) -> Option<u32> {
        let mut size = 0u32;
        let status = unsafe { AudioObjectGetPropertyDataSize(object, address, 0, ptr::null(), &mut size) };
        (status == 0).then_some(size)
    }

    fn read_ids(object: ObjectId, address: &Address) -> Vec<ObjectId> {
        let Some(size) = data_size(object, address) else {
            return Vec::new();
        };
        let mut ids = vec![0u32; size as usize / 4];
        let mut io_size = size;
        let status = unsafe { AudioObjectGetPropertyData(object, address, 0, ptr::null(), &mut io_size, ids.as_mut_ptr().cast()) };
        if status != 0 {
            return Vec::new();
        }
        ids.truncate(io_size as usize / 4);
        ids
    }

    fn default_output() -> ObjectId {
        read_ids(SYSTEM_OBJECT, &address(DEFAULT_OUTPUT, GLOBAL_SCOPE))
            .first()
            .copied()
            .unwrap_or(0)
    }

    fn devices() -> Vec<ObjectId> {
        read_ids(SYSTEM_OBJECT, &address(DEVICES, GLOBAL_SCOPE))
    }

    fn has_output_streams(device: ObjectId) -> bool {
        data_size(device, &address(STREAMS, OUTPUT_SCOPE)).is_some_and(|size| size > 0)
    }

    fn uid(device: ObjectId) -> Option<String> {
        if device == 0 {
            return None;
        }
        let mut value: *const c_void = ptr::null();
        let mut size = std::mem::size_of::<*const c_void>() as u32;
        let addr = address(DEVICE_UID, GLOBAL_SCOPE);
        let status = unsafe {
            AudioObjectGetPropertyData(device, &addr, 0, ptr::null(), &mut size, (&mut value as *mut *const c_void).cast())
        };
        if status != 0 || value.is_null() {
            return None;
        }
        let text = cf_string(value);
        unsafe { CFRelease(value) };
        text
    }

    fn cf_string(value: *const c_void) -> Option<String> {
        let capacity = unsafe { CFStringGetMaximumSizeForEncoding(CFStringGetLength(value), UTF8) } + 1;
        let mut buffer = vec![0u8; capacity as usize];
        let ok = unsafe { CFStringGetCString(value, buffer.as_mut_ptr().cast(), capacity, UTF8) } != 0;
        if !ok {
            return None;
        }
        let end = buffer.iter().position(|&byte| byte == 0)?;
        String::from_utf8(buffer[..end].to_vec()).ok()
    }

    pub fn snapshot() -> OutputState {
        let default_id = uid(default_output()).unwrap_or_default();
        let device_ids = devices()
            .into_iter()
            .filter(|&device| has_output_streams(device))
            .filter_map(uid)
            .collect();
        OutputState::new(&default_id, device_ids)
    }

    unsafe extern "C" fn on_change(_: ObjectId, _: u32, _: *const Address, _: *mut c_void) -> Status {
        super::on_device_change();
        0
    }

    pub fn watch(selector: u32) -> Result<(), Status> {
        let addr = address(selector, GLOBAL_SCOPE);
        let status = unsafe { AudioObjectAddPropertyListener(SYSTEM_OBJECT, &addr, on_change, ptr::null_mut()) };
        if status == 0 { Ok(()) } else { Err(status) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(default_id: &str, ids: &[&str]) -> OutputState {
        OutputState::new(default_id, ids.iter().map(|id| (*id).to_owned()).collect())
    }

    #[test]
    fn device_ids_are_sorted_and_deduped_without_empty_entries() {
        let next = OutputState::new("uid-b", vec!["uid-b".into(), "".into(), "uid-a".into(), "uid-b".into()]);
        assert_eq!(next.device_ids, vec!["uid-a", "uid-b"]);
    }

    #[test]
    fn fourcc_packs_the_property_codes_big_endian() {
        assert_eq!(fourcc(b"dev#"), 0x6465_7623);
        assert_eq!(fourcc(b"dOut"), 0x644F_7574);
    }

    #[test]
    fn first_snapshot_counts_as_a_change() {
        assert!(changed(None, &state("uid-a", &["uid-a"])));
    }

    #[test]
    fn same_devices_in_another_order_are_not_a_change() {
        let last = state("uid-a", &["uid-a", "uid-b"]);
        assert!(!changed(Some(&last), &state("uid-a", &["uid-b", "uid-a"])));
    }

    #[test]
    fn a_new_default_or_a_removed_device_is_a_change() {
        let last = state("uid-a", &["uid-a", "uid-b"]);
        assert!(changed(Some(&last), &state("uid-b", &["uid-a", "uid-b"])));
        assert!(changed(Some(&last), &state("uid-a", &["uid-a"])));
    }

    #[test]
    fn payload_uses_the_camel_case_keys() {
        let value = serde_json::to_value(state("uid-a", &["uid-a"])).unwrap();
        assert_eq!(value, serde_json::json!({ "defaultId": "uid-a", "deviceIds": ["uid-a"] }));
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn off_macos_the_snapshot_is_empty() {
        assert_eq!(audio_output_state(), state("", &[]));
    }
}

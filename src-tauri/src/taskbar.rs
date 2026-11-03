#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::time::Duration;

use tauri::AppHandle;

pub const RETRY_MS: u64 = 1500;
pub const MAX_ATTEMPTS: u32 = 5;
pub const PREVIOUS: u32 = 0;
pub const PLAY_PAUSE: u32 = 1;
pub const NEXT: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Glyph {
    Previous,
    Play,
    Pause,
    Next,
}

impl Glyph {
    pub const ALL: [Glyph; 4] = [Glyph::Previous, Glyph::Play, Glyph::Pause, Glyph::Next];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Button {
    pub id: u32,
    pub tip: &'static str,
    pub glyph: Glyph,
    pub command: &'static str,
}

pub fn buttons(playing: bool) -> [Button; 3] {
    let (tip, glyph) = if playing { ("Pause", Glyph::Pause) } else { ("Play", Glyph::Play) };
    [
        Button { id: PREVIOUS, tip: "Previous", glyph: Glyph::Previous, command: "previous" },
        Button { id: PLAY_PAUSE, tip, glyph, command: "play-pause" },
        Button { id: NEXT, tip: "Next", glyph: Glyph::Next, command: "next" },
    ]
}

pub fn command_for(id: u32) -> Option<&'static str> {
    buttons(false).into_iter().find(|button| button.id == id).map(|button| button.command)
}

pub fn retry_after(failed_attempts: u32) -> Option<Duration> {
    (failed_attempts < MAX_ATTEMPTS).then(|| Duration::from_millis(RETRY_MS))
}

fn in_rect(u: f32, v: f32, left: f32, top: f32, right: f32, bottom: f32) -> bool {
    (left..=right).contains(&u) && (top..=bottom).contains(&v)
}

fn in_triangle(u: f32, v: f32, corners: [(f32, f32); 3]) -> bool {
    let sign = |a: (f32, f32), b: (f32, f32)| (u - b.0) * (a.1 - b.1) - (a.0 - b.0) * (v - b.1);
    let [a, b, c] = corners;
    let (d1, d2, d3) = (sign(a, b), sign(b, c), sign(c, a));
    let negative = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let positive = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(negative && positive)
}

pub fn covered(glyph: Glyph, u: f32, v: f32) -> bool {
    match glyph {
        Glyph::Play => in_triangle(u, v, [(0.30, 0.20), (0.30, 0.80), (0.80, 0.50)]),
        Glyph::Pause => in_rect(u, v, 0.28, 0.20, 0.44, 0.80) || in_rect(u, v, 0.56, 0.20, 0.72, 0.80),
        Glyph::Previous => {
            in_rect(u, v, 0.14, 0.20, 0.26, 0.80) || in_triangle(u, v, [(0.86, 0.20), (0.86, 0.80), (0.26, 0.50)])
        }
        Glyph::Next => {
            in_rect(u, v, 0.74, 0.20, 0.86, 0.80) || in_triangle(u, v, [(0.14, 0.20), (0.14, 0.80), (0.74, 0.50)])
        }
    }
}

pub fn glyph_pixels(glyph: Glyph, size: usize) -> Vec<u8> {
    let mut pixels = Vec::with_capacity(size * size * 4);
    for y in 0..size {
        for x in 0..size {
            let u = (x as f32 + 0.5) / size as f32;
            let v = (y as f32 + 0.5) / size as f32;
            let value = if covered(glyph, u, v) { 255 } else { 0 };
            pixels.extend_from_slice(&[value, value, value, value]);
        }
    }
    pixels
}

pub fn set_playing(app: &AppHandle, playing: bool) {
    let main = app.clone();
    let _ = app.run_on_main_thread(move || platform::update(&main, playing));
}

pub fn setup(app: &AppHandle) {
    platform::attach_with_retry(app, 0);
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::OnceLock;

    use tauri::{AppHandle, Manager};
    use windows::core::{w, Result as WinResult};
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{CreateBitmap, DeleteObject, HGDIOBJ};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::UI::Shell::{
        DefSubclassProc, ITaskbarList3, SetWindowSubclass, TaskbarList, THBF_ENABLED, THBN_CLICKED, THB_FLAGS,
        THB_ICON, THB_TOOLTIP, THUMBBUTTON,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIconIndirect, RegisterWindowMessageW, HICON, ICONINFO, WM_COMMAND,
    };

    use super::{buttons, command_for, glyph_pixels, retry_after, Glyph};
    use crate::tray::{self, Tray};
    use crate::window::MAIN;

    const SUBCLASS_ID: usize = 0x48_55_53;
    const ICON_SIZE: usize = 32;

    static SUBCLASSED: AtomicBool = AtomicBool::new(false);
    static ICONS: OnceLock<Vec<isize>> = OnceLock::new();
    static TASKBAR_CREATED: OnceLock<u32> = OnceLock::new();

    fn taskbar_created() -> u32 {
        *TASKBAR_CREATED.get_or_init(|| unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) })
    }

    pub fn attach_with_retry(app: &AppHandle, failed_attempts: u32) {
        let Err(error) = attach(app) else {
            return;
        };
        let failed = failed_attempts + 1;
        tracing::warn!(%error, failed, "taskbar buttons not ready");
        if retry_after(failed).is_none() {
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(retry_after(failed).unwrap_or_default());
            let next = app.clone();
            let _ = app.run_on_main_thread(move || attach_with_retry(&next, failed));
        });
    }

    fn attach(app: &AppHandle) -> Result<(), String> {
        let window = app.get_webview_window(MAIN).ok_or("main window missing")?;
        let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
        let icons = icons()?;
        let playing = app.state::<Tray>().playing();
        let thumbs = thumb_buttons(playing, &icons);
        unsafe {
            let taskbar = taskbar()?;
            taskbar.ThumbBarAddButtons(hwnd, &thumbs).map_err(|error| error.to_string())?;
        }
        if !SUBCLASSED.swap(true, Ordering::SeqCst) {
            let data = Box::into_raw(Box::new(app.clone())) as usize;
            let installed = unsafe { SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, data) };
            if !installed.as_bool() {
                SUBCLASSED.store(false, Ordering::SeqCst);
                return Err("window subclass refused".to_owned());
            }
        }
        Ok(())
    }

    pub fn update(app: &AppHandle, playing: bool) {
        let Some(window) = app.get_webview_window(MAIN) else {
            return;
        };
        let Ok(handle) = window.hwnd() else {
            return;
        };
        let Some(icons) = ICONS.get() else {
            return;
        };
        let thumbs = thumb_buttons(playing, icons);
        if let Ok(taskbar) = taskbar() {
            let _ = unsafe { taskbar.ThumbBarUpdateButtons(HWND(handle.0), &thumbs) };
        }
    }

    fn taskbar() -> Result<ITaskbarList3, String> {
        unsafe {
            let taskbar: ITaskbarList3 =
                CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).map_err(|error| error.to_string())?;
            taskbar.HrInit().map_err(|error| error.to_string())?;
            Ok(taskbar)
        }
    }

    fn icons() -> Result<Vec<isize>, String> {
        if let Some(icons) = ICONS.get() {
            return Ok(icons.clone());
        }
        let icons = Glyph::ALL
            .iter()
            .map(|glyph| make_icon(*glyph).map(|icon| icon.0 as isize))
            .collect::<WinResult<Vec<isize>>>()
            .map_err(|error| error.to_string())?;
        let _ = ICONS.set(icons.clone());
        Ok(icons)
    }

    fn make_icon(glyph: Glyph) -> WinResult<HICON> {
        let size = ICON_SIZE as i32;
        let pixels = glyph_pixels(glyph, ICON_SIZE);
        let mask_bits = vec![0u8; ICON_SIZE * ICON_SIZE / 8];
        unsafe {
            let color = CreateBitmap(size, size, 1, 32, Some(pixels.as_ptr() as *const c_void));
            let mask = CreateBitmap(size, size, 1, 1, Some(mask_bits.as_ptr() as *const c_void));
            let info = ICONINFO { fIcon: BOOL(1), xHotspot: 0, yHotspot: 0, hbmMask: mask, hbmColor: color };
            let icon = CreateIconIndirect(&info);
            let _ = DeleteObject(HGDIOBJ(color.0));
            let _ = DeleteObject(HGDIOBJ(mask.0));
            icon
        }
    }

    fn thumb_buttons(playing: bool, icons: &[isize]) -> Vec<THUMBBUTTON> {
        buttons(playing)
            .iter()
            .map(|button| {
                let mut tip = [0u16; 260];
                for (slot, unit) in tip.iter_mut().zip(button.tip.encode_utf16()) {
                    *slot = unit;
                }
                THUMBBUTTON {
                    dwMask: THB_ICON | THB_TOOLTIP | THB_FLAGS,
                    iId: button.id,
                    iBitmap: 0,
                    hIcon: HICON(icons[button.glyph as usize] as *mut c_void),
                    szTip: tip,
                    dwFlags: THBF_ENABLED,
                }
            })
            .collect()
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        data: usize,
    ) -> LRESULT {
        let app = unsafe { &*(data as *const AppHandle) };
        if message == taskbar_created() {
            attach_with_retry(app, 0);
        }
        if message == WM_COMMAND && ((wparam.0 >> 16) & 0xffff) as u32 == THBN_CLICKED {
            if let Some(command) = command_for((wparam.0 & 0xffff) as u32) {
                tray::send_command(app, command);
            }
            return LRESULT(0);
        }
        unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use tauri::AppHandle;

    pub fn attach_with_retry(_app: &AppHandle, _failed_attempts: u32) {}

    pub fn update(_app: &AppHandle, _playing: bool) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buttons_are_previous_play_pause_next_in_order() {
        let paused = buttons(false);
        assert_eq!(paused.map(|button| button.tip), ["Previous", "Play", "Next"]);
        assert_eq!(paused.map(|button| button.command), ["previous", "play-pause", "next"]);
        assert_eq!(paused.map(|button| button.id), [PREVIOUS, PLAY_PAUSE, NEXT]);
    }

    #[test]
    fn the_middle_button_reads_pause_while_playing() {
        let playing = buttons(true);
        assert_eq!(playing[1].tip, "Pause");
        assert_eq!(playing[1].glyph, Glyph::Pause);
        assert_eq!(buttons(false)[1].glyph, Glyph::Play);
    }

    #[test]
    fn a_thumb_click_maps_to_the_menu_command_of_its_button() {
        assert_eq!(command_for(PREVIOUS), Some("previous"));
        assert_eq!(command_for(PLAY_PAUSE), Some("play-pause"));
        assert_eq!(command_for(NEXT), Some("next"));
        assert_eq!(command_for(7), None);
    }

    #[test]
    fn a_refused_taskbar_is_retried_every_1500_ms_up_to_the_limit() {
        assert_eq!(retry_after(1), Some(Duration::from_millis(1500)));
        assert_eq!(retry_after(MAX_ATTEMPTS - 1), Some(Duration::from_millis(1500)));
        assert_eq!(retry_after(MAX_ATTEMPTS), None);
    }

    #[test]
    fn the_play_triangle_points_right_and_the_pause_bars_leave_a_gap() {
        assert!(covered(Glyph::Play, 0.4, 0.5));
        assert!(!covered(Glyph::Play, 0.9, 0.5));
        assert!(!covered(Glyph::Play, 0.4, 0.1));
        assert!(covered(Glyph::Pause, 0.35, 0.5));
        assert!(!covered(Glyph::Pause, 0.5, 0.5));
    }

    #[test]
    fn previous_and_next_point_in_opposite_directions() {
        assert!(covered(Glyph::Previous, 0.3, 0.5));
        assert!(!covered(Glyph::Previous, 0.95, 0.5));
        assert!(covered(Glyph::Next, 0.8, 0.5));
        assert!(!covered(Glyph::Next, 0.05, 0.5));
    }

    #[test]
    fn glyph_pixels_are_opaque_white_or_transparent_black() {
        let pixels = glyph_pixels(Glyph::Play, 16);
        assert_eq!(pixels.len(), 16 * 16 * 4);
        assert!(pixels.chunks(4).all(|px| px == [0, 0, 0, 0] || px == [255, 255, 255, 255]));
        assert!(pixels.chunks(4).any(|px| px == [255, 255, 255, 255]));
    }
}

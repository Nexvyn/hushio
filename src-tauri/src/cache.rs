use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::cache_limit;

const MIB: u64 = 1024 * 1024;
const MIN_MB: u64 = 64;
const MAX_MB: u64 = 8192;
pub const DEFAULT_MB: u64 = 256;
static LIMIT_BYTES: AtomicU64 = AtomicU64::new(DEFAULT_MB * MIB);

#[derive(Serialize, Default, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub bytes: u64,
    pub files: u64,
}

pub fn clamp_mb(megabytes: u64) -> u64 {
    megabytes.clamp(MIN_MB, MAX_MB)
}

pub fn limit_bytes() -> u64 {
    LIMIT_BYTES.load(Ordering::Relaxed)
}

pub fn set_limit_mb(megabytes: u64) -> u64 {
    let bytes = clamp_mb(megabytes) * MIB;
    LIMIT_BYTES.store(bytes, Ordering::Relaxed);
    bytes
}

pub fn limit_mb_from_settings(settings: Option<&Value>) -> u64 {
    settings
        .and_then(|value| value["state"]["imageCacheMb"].as_u64())
        .map_or(DEFAULT_MB, clamp_mb)
}

pub fn usage(dir: &Path) -> io::Result<Usage> {
    let mut usage = Usage::default();
    if !dir.is_dir() {
        return Ok(usage);
    }
    for item in fs::read_dir(dir)? {
        let meta = item?.metadata()?;
        if meta.is_file() {
            usage.bytes += meta.len();
            usage.files += 1;
        }
    }
    Ok(usage)
}

pub fn clear(dir: &Path) -> io::Result<usize> {
    if !dir.is_dir() {
        return Ok(0);
    }
    let mut removed = 0;
    for item in fs::read_dir(dir)? {
        let path = item?.path();
        if path.is_file() && fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|dir| dir.join("images"))
        .map_err(|error| error.to_string())
}

fn io_text(error: io::Error) -> String {
    error.to_string()
}

#[tauri::command]
pub fn cache_size(app: AppHandle) -> Result<Usage, String> {
    usage(&images_dir(&app)?).map_err(io_text)
}

#[tauri::command]
pub fn cache_clear(app: AppHandle) -> Result<Usage, String> {
    let dir = images_dir(&app)?;
    clear(&dir).map_err(io_text)?;
    usage(&dir).map_err(io_text)
}

#[tauri::command]
pub fn cache_set_limit(app: AppHandle, megabytes: u64) -> Result<Usage, String> {
    let dir = images_dir(&app)?;
    cache_limit::trim_dir(&dir, set_limit_mb(megabytes)).map_err(io_text)?;
    usage(&dir).map_err(io_text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scratch(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |time| time.as_nanos());
        std::env::temp_dir().join(format!("hushio-{name}-{}-{nanos}", std::process::id()))
    }

    #[test]
    fn limits_are_clamped_to_the_supported_range() {
        assert_eq!(clamp_mb(1), 64);
        assert_eq!(clamp_mb(512), 512);
        assert_eq!(clamp_mb(99_999), 8192);
    }

    #[test]
    fn the_stored_limit_is_read_from_settings_with_a_default() {
        let saved = json!({ "state": { "imageCacheMb": 1024 }, "version": 2 });
        assert_eq!(limit_mb_from_settings(Some(&saved)), 1024);
        assert_eq!(limit_mb_from_settings(Some(&json!({ "state": { "imageCacheMb": "big" } }))), DEFAULT_MB);
        assert_eq!(limit_mb_from_settings(None), DEFAULT_MB);
    }

    #[test]
    fn setting_the_limit_stores_it_in_bytes() {
        assert_eq!(set_limit_mb(512), 512 * MIB);
        assert_eq!(limit_bytes(), 512 * MIB);
    }

    #[test]
    fn usage_counts_files_and_clear_removes_them_but_keeps_the_folder() {
        let dir = scratch("cache-usage");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.jpg"), vec![0u8; 10]).unwrap();
        fs::write(dir.join("b.jpg"), vec![0u8; 5]).unwrap();
        assert_eq!(usage(&dir).unwrap(), Usage { bytes: 15, files: 2 });
        assert_eq!(clear(&dir).unwrap(), 2);
        assert_eq!(usage(&dir).unwrap(), Usage::default());
        assert!(dir.is_dir());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_missing_cache_folder_is_empty() {
        let dir = scratch("cache-missing");
        assert_eq!(usage(&dir).unwrap(), Usage::default());
        assert_eq!(clear(&dir).unwrap(), 0);
    }
}

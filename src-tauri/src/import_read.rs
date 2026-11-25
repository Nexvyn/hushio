use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{DragDropEvent, Manager, State, Window, WindowEvent};

const RECENT: Duration = Duration::from_secs(60);
const LIMIT: u64 = 16 * 1024 * 1024;
const EXTENSIONS: [&str; 5] = ["csv", "m3u", "m3u8", "txt", "json"];

#[derive(Default)]
pub struct RecentDrops(Mutex<Vec<(PathBuf, Instant)>>);

impl RecentDrops {
    fn record(&self, paths: &[PathBuf], now: Instant) {
        let Ok(mut list) = self.0.lock() else { return };
        list.retain(|(_, at)| now.duration_since(*at) < RECENT);
        list.extend(paths.iter().filter_map(|path| std::fs::canonicalize(path).ok()).map(|path| (path, now)));
    }

    fn contains(&self, path: &Path, now: Instant) -> bool {
        let Ok(list) = self.0.lock() else { return false };
        list.iter().any(|(item, at)| item == path && now.duration_since(*at) < RECENT)
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event else {
        return;
    };
    if let Some(drops) = window.app_handle().try_state::<RecentDrops>() {
        drops.record(paths, Instant::now());
    }
}

fn extension_allowed(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| EXTENSIONS.iter().any(|allowed| ext.eq_ignore_ascii_case(allowed)))
}

fn read_dropped(path: &str, drops: &RecentDrops, now: Instant) -> Result<String, String> {
    let path = Path::new(path);
    if !extension_allowed(path) {
        return Err("Only CSV, M3U, M3U8, TXT or JSON files can be imported".into());
    }
    let link = std::fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !link.is_file() {
        return Err("Only files can be imported".into());
    }
    let canonical = std::fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !drops.contains(&canonical, now) {
        return Err("That file was not dropped here just now".into());
    }
    let size = std::fs::metadata(&canonical).map_err(|error| error.to_string())?.len();
    if size > LIMIT {
        return Err("File is too large".into());
    }
    std::fs::read(&canonical)
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_read_text(path: String, drops: State<'_, RecentDrops>) -> Result<String, String> {
    read_dropped(&path, &drops, Instant::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hushio-import-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn allows_only_playlist_extensions_in_any_case() {
        for name in ["a.csv", "a.CSV", "a.m3u", "a.m3u8", "a.TXT", "a.Json"] {
            assert!(extension_allowed(Path::new(name)), "{name}");
        }
        for name in ["a.mp3", "a.exe", "a.json.exe", "noext"] {
            assert!(!extension_allowed(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn reads_only_files_dropped_within_the_last_minute() {
        let dir = scratch("recent");
        let file = dir.join("list.txt");
        std::fs::write(&file, "Artist - One").expect("file");
        let drops = RecentDrops::default();
        let start = Instant::now();
        drops.record(std::slice::from_ref(&file), start);
        let path = file.to_string_lossy().into_owned();

        assert_eq!(read_dropped(&path, &drops, start + Duration::from_secs(59)).as_deref(), Ok("Artist - One"));
        assert!(read_dropped(&path, &drops, start + Duration::from_secs(61)).is_err());
        assert!(read_dropped(&path, &RecentDrops::default(), start).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_directory_even_when_dropped() {
        let dir = scratch("dir");
        let folder = dir.join("folder.txt");
        std::fs::create_dir_all(&folder).expect("folder");
        let drops = RecentDrops::default();
        let now = Instant::now();
        drops.record(std::slice::from_ref(&folder), now);
        assert!(read_dropped(&folder.to_string_lossy(), &drops, now).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

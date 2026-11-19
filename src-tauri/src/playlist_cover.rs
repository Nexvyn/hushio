use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::reveal::allow_asset;
use crate::DataPaths;

pub const COVER_DIR: &str = "playlist-covers";
const MAX_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ID_LEN: usize = 64;

fn safe_id(playlist_id: &str) -> Option<&str> {
    let ok = !playlist_id.is_empty()
        && playlist_id.len() <= MAX_ID_LEN
        && playlist_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    ok.then_some(playlist_id)
}

fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    None
}

fn file_prefix(id: &str) -> String {
    format!("{id}.")
}

fn remove_stale(dir: &Path, id: &str, keep: Option<&Path>) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    let prefix = file_prefix(id);
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let matches = name.to_string_lossy().starts_with(&prefix);
        if matches && keep != Some(path.as_path()) {
            fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn store_cover(dir: &Path, playlist_id: &str, source: &Path) -> Result<PathBuf, String> {
    let id = safe_id(playlist_id).ok_or_else(|| "Invalid playlist id".to_owned())?;
    let size = fs::metadata(source).map_err(|error| error.to_string())?.len();
    if size > MAX_BYTES {
        return Err("Pick an image under 10 MB".to_owned());
    }
    let bytes = fs::read(source).map_err(|error| error.to_string())?;
    let ext = image_extension(&bytes).ok_or_else(|| "Pick a JPG, PNG or WebP image".to_owned())?;
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|age| age.as_millis())
        .unwrap_or(0);
    let target = dir.join(format!("{id}.{stamp}.{ext}"));
    let tmp = dir.join(format!("{id}.{stamp}.{ext}.tmp"));
    fs::write(&tmp, &bytes).map_err(|error| error.to_string())?;
    fs::rename(&tmp, &target).map_err(|error| error.to_string())?;
    remove_stale(dir, id, Some(&target))?;
    Ok(target)
}

pub fn remove_cover(dir: &Path, playlist_id: &str) -> Result<(), String> {
    let id = safe_id(playlist_id).ok_or_else(|| "Invalid playlist id".to_owned())?;
    remove_stale(dir, id, None)
}

fn cover_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.state::<DataPaths>().root.clone();
    Ok(root.join(COVER_DIR))
}

#[tauri::command]
pub async fn playlist_cover_pick(app: AppHandle, playlist_id: String) -> Result<Option<String>, String> {
    safe_id(&playlist_id).ok_or_else(|| "Invalid playlist id".to_owned())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose a cover image")
        .add_filter("Images", &["jpg", "jpeg", "png", "webp"])
        .pick_file(move |picked| {
            let _ = sender.send(picked);
        });
    let Some(picked) = receiver.await.map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let source = picked.into_path().map_err(|error| error.to_string())?;
    let dir = cover_dir(&app)?;
    let stored = store_cover(&dir, &playlist_id, &source)?;
    allow_asset(&app, &dir)?;
    Ok(Some(stored.display().to_string()))
}

#[tauri::command]
pub fn playlist_cover_remove(app: AppHandle, playlist_id: String) -> Result<(), String> {
    remove_cover(&cover_dir(&app)?, &playlist_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
    const JPG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0, 0];

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hushio-cover-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn source(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, bytes).unwrap();
        path
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut out: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        out.sort();
        out
    }

    #[test]
    fn stores_a_png_under_the_playlist_id() {
        let base = scratch("png");
        let dir = base.join(COVER_DIR);
        let src = source(&base, "pick.bin", PNG);
        let stored = store_cover(&dir, "pl-1", &src).unwrap();
        assert!(stored.starts_with(&dir));
        assert_eq!(stored.extension().unwrap(), "png");
        assert_eq!(fs::read(&stored).unwrap(), PNG);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn replacing_keeps_only_the_newest_file() {
        let base = scratch("replace");
        let dir = base.join(COVER_DIR);
        let first = store_cover(&dir, "pl_2", &source(&base, "a.png", PNG)).unwrap();
        let second = store_cover(&dir, "pl_2", &source(&base, "b.jpg", JPG)).unwrap();
        assert_ne!(first, second);
        assert_eq!(names(&dir).len(), 1);
        assert!(second.exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn other_playlists_are_left_alone() {
        let base = scratch("others");
        let dir = base.join(COVER_DIR);
        store_cover(&dir, "pl", &source(&base, "a.png", PNG)).unwrap();
        store_cover(&dir, "pl-2", &source(&base, "b.png", PNG)).unwrap();
        store_cover(&dir, "pl", &source(&base, "c.jpg", JPG)).unwrap();
        assert_eq!(names(&dir).len(), 2);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_non_images_and_bad_ids() {
        let base = scratch("reject");
        let dir = base.join(COVER_DIR);
        let text = source(&base, "notes.txt", b"not an image at all");
        assert!(store_cover(&dir, "pl", &text).is_err());
        assert!(store_cover(&dir, "../escape", &source(&base, "a.png", PNG)).is_err());
        assert!(store_cover(&dir, "", &source(&base, "a.png", PNG)).is_err());
        assert!(!dir.exists() || names(&dir).is_empty());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn remove_clears_the_playlist_cover_only() {
        let base = scratch("remove");
        let dir = base.join(COVER_DIR);
        store_cover(&dir, "keep", &source(&base, "a.png", PNG)).unwrap();
        store_cover(&dir, "gone", &source(&base, "b.png", PNG)).unwrap();
        remove_cover(&dir, "gone").unwrap();
        let left = names(&dir);
        assert_eq!(left.len(), 1);
        assert!(left[0].starts_with("keep."));
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn removing_a_missing_folder_is_not_an_error() {
        let base = scratch("missing");
        assert!(remove_cover(&base.join("nope"), "pl").is_ok());
        let _ = fs::remove_dir_all(&base);
    }
}

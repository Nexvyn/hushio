use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;
use tauri::State;

use crate::drive_sync::Drive;
use crate::google_auth::GoogleAuth;
use crate::persist;
use crate::reveal::Folders;
use crate::stats;
use crate::yt_data_api::{self, ApiError, YtApi};
use crate::yt_innertube_auth::Innertube;
use crate::{DataPaths, YtEngine};

const OWNER: &str = "guest";
const LIBRARY_STORE: &str = "library";

pub fn linked_playlist_ids(library: &Value) -> Vec<String> {
    library["state"]["playlists"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|playlist| playlist["remote"]["ytPlaylistId"].as_str().map(str::to_owned))
        .collect()
}

pub fn delete_outcome(result: Result<(), ApiError>) -> Result<(), String> {
    match result {
        Ok(()) => Ok(()),
        Err(error) if error.status() == Some(404) => Ok(()),
        Err(error) => Err(error.describe()),
    }
}

pub fn wipe_local(root: &Path, downloads: &[PathBuf]) -> Result<(), String> {
    for path in downloads {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("Could not delete {}: {error}", path.display())),
        }
    }
    let entries = match std::fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let marker = std::ffi::OsString::from(format!(".{}-install", crate::APP_SLUG));
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.file_name() == marker {
            continue;
        }
        let path = entry.path();
        let removed = if path.is_dir() {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_file(&path)
        };
        removed.map_err(|error| format!("Could not erase {}: {error}", path.display()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn erase_stop_sync(
    drive: State<'_, Arc<Drive>>,
    engine: State<'_, Arc<YtEngine>>,
) -> Result<(), String> {
    drive.stop().await;
    engine.stop().await
}

#[tauri::command]
pub fn erase_resume_sync(drive: State<'_, Arc<Drive>>, engine: State<'_, Arc<YtEngine>>) {
    drive.resume();
    engine.resume();
}

#[tauri::command]
pub async fn erase_drive_files(drive: State<'_, Arc<Drive>>) -> Result<usize, String> {
    drive.erase_app_data().await
}

#[tauri::command]
pub async fn erase_youtube_playlists(
    paths: State<'_, DataPaths>,
    google: State<'_, Arc<GoogleAuth>>,
) -> Result<usize, String> {
    let library = persist::read(&paths.root, OWNER, LIBRARY_STORE)
        .await
        .unwrap_or(Value::Null);
    let api = YtApi::new(
        yt_data_api::API_BASE,
        Arc::new(std::sync::Mutex::new(yt_data_api::Quota::default())),
    );
    let tokens: &Arc<GoogleAuth> = google.inner();
    let ids = linked_playlist_ids(&library);
    for id in &ids {
        delete_outcome(api.delete_playlist(tokens, id).await)?;
    }
    Ok(ids.len())
}

#[tauri::command]
pub async fn erase_revoke(
    google: State<'_, Arc<GoogleAuth>>,
    tv: State<'_, Arc<Innertube>>,
) -> Result<(), String> {
    google.revoke().await?;
    tv.revoke().await
}

#[tauri::command]
pub fn erase_keyring(google: State<'_, Arc<GoogleAuth>>, tv: State<'_, Arc<Innertube>>) -> Result<(), String> {
    google.forget();
    tv.forget()
}

#[tauri::command]
pub fn erase_local_data(
    paths: State<'_, DataPaths>,
    folders: State<'_, Folders>,
    stats: State<'_, Arc<stats::Service>>,
    delete_downloads: bool,
    download_paths: Vec<String>,
) -> Result<(), String> {
    let downloads = if delete_downloads {
        download_paths
            .iter()
            .map(|path| {
                let path = PathBuf::from(path);
                folders.check(&path).map(|()| path)
            })
            .collect::<Result<Vec<_>, _>>()?
    } else {
        Vec::new()
    };
    stats.erase();
    wipe_local(&paths.root, &downloads)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn write(path: &Path, text: &str) {
        std::fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
        std::fs::write(path, text).expect("write");
    }

    fn seed_root(root: &Path) {
        write(&root.join("data").join("guest").join("library.json"), "{}");
        write(&root.join("data").join("guest").join("settings.json"), "{}");
        write(&root.join("localart").join("cover.jpg"), "art");
        write(&root.join(".hushio-install"), "");
    }

    #[test]
    fn wipe_keeps_downloads_unless_ticked() {
        let base = tempfile::tempdir().expect("temp dir");
        let root = base.path().join("app");
        let downloads = base.path().join("Downloads").join("Hushio");
        seed_root(&root);
        write(&downloads.join("song.m4a"), "audio");

        wipe_local(&root, &[]).expect("wipe");
        assert!(!root.join("data").exists());
        assert!(!root.join("localart").exists());
        assert!(root.join(".hushio-install").exists());
        assert!(downloads.join("song.m4a").exists());

        seed_root(&root);
        wipe_local(&root, &[downloads.join("song.m4a")]).expect("wipe with downloads");
        assert!(!downloads.join("song.m4a").exists());
        assert!(!root.join("data").exists());
    }

    #[test]
    fn reset_keeps_downloads_and_removes_only_local_data() {
        let base = tempfile::tempdir().expect("temp dir");
        let root = base.path().join("app");
        let downloads = base.path().join("Downloads").join("Hushio");
        seed_root(&root);
        write(&downloads.join("song.m4a"), "audio");
        wipe_local(&root, &[]).expect("reset");
        assert!(downloads.join("song.m4a").exists());
        assert!(!root.join("data").join("guest").join("library.json").exists());
    }

    #[test]
    fn a_missing_download_is_not_an_error() {
        let base = tempfile::tempdir().expect("temp dir");
        let root = base.path().join("app");
        seed_root(&root);
        let gone = base.path().join("gone.m4a");
        assert!(wipe_local(&root, &[gone]).is_ok());
    }

    #[test]
    fn only_playlists_with_a_youtube_link_are_deleted() {
        let library = json!({
            "state": {
                "playlists": [
                    {"id": "a", "remote": {"ytPlaylistId": "PL1"}},
                    {"id": "b"},
                    {"id": "c", "remote": {"ytPlaylistId": "PL2"}}
                ]
            }
        });
        assert_eq!(linked_playlist_ids(&library), vec!["PL1".to_owned(), "PL2".to_owned()]);
        assert!(linked_playlist_ids(&Value::Null).is_empty());
    }

    #[test]
    fn a_playlist_already_gone_counts_as_deleted() {
        let gone = ApiError::Status { status: 404, reason: None, message: String::new() };
        assert_eq!(delete_outcome(Err(gone)), Ok(()));
        let refused = ApiError::Status { status: 403, reason: None, message: "nope".to_owned() };
        assert!(delete_outcome(Err(refused)).is_err());
    }
}

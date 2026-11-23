use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tokio::io::AsyncWriteExt;

pub const MAX_STORE_BYTES: usize = 16 * 1024 * 1024;
const RENAME_BACKOFF_MS: [u64; 4] = [40, 80, 120, 160];
const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

pub fn store_path(root: &Path, owner: &str, name: &str) -> PathBuf {
    root.join("data")
        .join(sanitize(owner, "guest"))
        .join(format!("{}.json", sanitize(name, "store")))
}

fn sanitize(value: &str, fallback: &str) -> String {
    if value.is_empty() {
        return fallback.to_string();
    }
    let mut cleaned = String::with_capacity(value.len());
    for c in value.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            cleaned.push(c);
        } else {
            for byte in c.to_string().bytes() {
                cleaned.push_str(&format!("~{byte:02x}"));
            }
        }
    }
    cleaned
}

pub async fn read(root: &Path, owner: &str, name: &str) -> Option<Value> {
    let path = store_path(root, owner, name);
    let bytes = match tokio::fs::read(&path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return None,
        Err(error) => {
            tracing::warn!(%error, path = %path.display(), "could not read store");
            return None;
        }
    };
    match serde_json::from_slice(&bytes) {
        Ok(value) => Some(value),
        Err(error) => {
            tracing::warn!(%error, path = %path.display(), "store is not valid JSON");
            move_aside(&path).await;
            None
        }
    }
}

async fn move_aside(path: &Path) {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("store.json");
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    let target = path.with_file_name(format!("{name}.corrupt-{millis}"));
    if let Err(error) = tokio::fs::rename(path, &target).await {
        tracing::warn!(%error, path = %path.display(), "could not move corrupt store aside");
    }
}

pub async fn write(root: &Path, owner: &str, name: &str, data: &Value) -> Result<(), String> {
    let path = store_path(root, owner, name);
    if data.is_null() {
        return match tokio::fs::remove_file(&path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }
    let bytes = serde_json::to_vec(data).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_STORE_BYTES {
        return Err("Store is larger than 16 MiB".to_string());
    }
    write_atomic(&path, &bytes)
        .await
        .map_err(|error| error.to_string())
}

async fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        if let Err(error) = tokio::fs::create_dir_all(parent).await {
            tracing::warn!(%error, path = %parent.display(), "could not create data folder");
        }
    }
    let tmp = temp_path(path);
    let result = async {
        write_synced(&tmp, bytes).await?;
        rename_with_retry(&tmp, path).await
    }
    .await;
    if let Err(error) = tokio::fs::remove_file(&tmp).await {
        if error.kind() != io::ErrorKind::NotFound {
            tracing::warn!(%error, path = %tmp.display(), "could not remove temp file");
        }
    }
    result
}

async fn write_synced(tmp: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = tokio::fs::File::create(tmp).await?;
    file.write_all(bytes).await?;
    file.sync_all().await
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("store.json");
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0);
    path.with_file_name(format!("{name}.{millis}.{}.tmp", base36()))
}

fn base36() -> String {
    let mut value = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos() as u64)
        .unwrap_or(0);
    let mut suffix = String::with_capacity(6);
    for _ in 0..6 {
        suffix.push(DIGITS[(value % 36) as usize] as char);
        value /= 36;
    }
    suffix
}

async fn rename_with_retry(tmp: &Path, target: &Path) -> io::Result<()> {
    let mut last = match tokio::fs::rename(tmp, target).await {
        Ok(()) => return Ok(()),
        Err(error) => error,
    };
    for delay in RENAME_BACKOFF_MS {
        tokio::time::sleep(Duration::from_millis(delay)).await;
        match tokio::fs::rename(tmp, target).await {
            Ok(()) => return Ok(()),
            Err(error) => last = error,
        }
    }
    tracing::warn!(%last, "rename failed");
    Err(last)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_root() -> tempfile::TempDir {
        tempfile::tempdir().expect("temp dir")
    }

    fn temp_files(dir: &Path) -> Vec<String> {
        std::fs::read_dir(dir)
            .expect("read dir")
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect()
    }

    #[tokio::test]
    async fn written_value_reads_back() {
        let root = temp_root();
        let value = json!({ "state": { "volume": 0.4 }, "version": 1 });
        write(root.path(), "guest", "player", &value)
            .await
            .expect("write");
        let stored = read(root.path(), "guest", "player").await;
        assert_eq!(stored, Some(value));
    }

    #[tokio::test]
    async fn write_leaves_no_temp_file() {
        let root = temp_root();
        write(root.path(), "guest", "library", &json!({ "items": [] }))
            .await
            .expect("write");
        let dir = store_path(root.path(), "guest", "library")
            .parent()
            .expect("parent")
            .to_path_buf();
        assert!(temp_files(&dir).is_empty());
    }

    #[tokio::test]
    async fn missing_file_reads_as_none() {
        let root = temp_root();
        assert_eq!(read(root.path(), "guest", "settings").await, None);
    }

    #[tokio::test]
    async fn unparsable_file_reads_as_none() {
        let root = temp_root();
        let path = store_path(root.path(), "guest", "settings");
        std::fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
        std::fs::write(&path, b"{").expect("write");
        assert_eq!(read(root.path(), "guest", "settings").await, None);
    }

    #[tokio::test]
    async fn owners_get_separate_files() {
        let root = temp_root();
        write(
            root.path(),
            "guest",
            "library",
            &json!({ "owner": "guest" }),
        )
        .await
        .expect("guest write");
        write(
            root.path(),
            "1234567890",
            "library",
            &json!({ "owner": "google" }),
        )
        .await
        .expect("google write");
        assert_eq!(
            read(root.path(), "guest", "library").await,
            Some(json!({ "owner": "guest" }))
        );
        assert_eq!(
            read(root.path(), "1234567890", "library").await,
            Some(json!({ "owner": "google" }))
        );
    }

    #[tokio::test]
    async fn store_name_is_sanitized() {
        let root = temp_root();
        write(
            root.path(),
            "../owner",
            "../library",
            &json!({ "ok": true }),
        )
        .await
        .expect("write");
        let path = store_path(root.path(), "../owner", "../library");
        assert_eq!(
            path.parent().expect("parent").file_name(),
            Some("~2e~2e~2fowner".as_ref())
        );
        assert_eq!(path.file_name(), Some("~2e~2e~2flibrary.json".as_ref()));
    }

    #[tokio::test]
    async fn oversized_write_is_rejected() {
        let root = temp_root();
        let value = json!("x".repeat(MAX_STORE_BYTES));
        assert_eq!(
            write(root.path(), "guest", "library", &value).await,
            Err("Store is larger than 16 MiB".to_string())
        );
    }

    fn store_dir(root: &Path, owner: &str, name: &str) -> PathBuf {
        store_path(root, owner, name)
            .parent()
            .expect("parent")
            .to_path_buf()
    }

    #[tokio::test]
    async fn second_write_replaces_first() {
        let root = temp_root();
        write(root.path(), "guest", "player", &json!({ "volume": 0.2 }))
            .await
            .expect("first write");
        write(root.path(), "guest", "player", &json!({ "volume": 0.9 }))
            .await
            .expect("second write");
        assert_eq!(
            read(root.path(), "guest", "player").await,
            Some(json!({ "volume": 0.9 }))
        );
        assert!(temp_files(&store_dir(root.path(), "guest", "player")).is_empty());
    }

    #[tokio::test]
    async fn repeated_writes_leave_only_the_store_file() {
        let root = temp_root();
        for index in 0..5 {
            write(root.path(), "guest", "library", &json!({ "index": index }))
                .await
                .expect("write");
        }
        let names: Vec<String> = std::fs::read_dir(store_dir(root.path(), "guest", "library"))
            .expect("read dir")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(names, vec!["library.json".to_string()]);
    }

    #[tokio::test]
    async fn truncated_json_reads_as_none_without_panicking() {
        let root = temp_root();
        let path = store_path(root.path(), "guest", "player");
        std::fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
        std::fs::write(&path, br#"{"state":{"volume":0.4"#).expect("write");
        assert_eq!(read(root.path(), "guest", "player").await, None);
    }

    #[tokio::test]
    async fn corrupt_file_is_moved_aside_before_reading_as_none() {
        let root = temp_root();
        let path = store_path(root.path(), "guest", "player");
        let dir = path.parent().expect("parent").to_path_buf();
        std::fs::create_dir_all(&dir).expect("dirs");
        std::fs::write(&path, b"not json").expect("write");
        assert_eq!(read(root.path(), "guest", "player").await, None);

        assert!(!path.exists());
        let moved: Vec<PathBuf> = std::fs::read_dir(&dir)
            .expect("read dir")
            .map(|entry| entry.expect("entry").path())
            .filter(|moved| {
                moved
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("player.json.corrupt-"))
            })
            .collect();
        assert_eq!(moved.len(), 1);
        assert_eq!(std::fs::read(&moved[0]).expect("read moved"), b"not json");
    }

    #[tokio::test]
    async fn write_after_corrupt_file_recovers_the_store() {
        let root = temp_root();
        let path = store_path(root.path(), "guest", "player");
        std::fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
        std::fs::write(&path, b"not json").expect("write");
        assert_eq!(read(root.path(), "guest", "player").await, None);

        let value = json!({ "volume": 0.7 });
        write(root.path(), "guest", "player", &value)
            .await
            .expect("write");
        assert_eq!(read(root.path(), "guest", "player").await, Some(value));
    }

    #[test]
    fn guest_and_account_owners_get_their_own_folder() {
        let root = Path::new("root");
        assert_eq!(
            store_path(root, "guest", "library"),
            root.join("data").join("guest").join("library.json")
        );
        assert_eq!(
            store_path(root, "1234567890", "library"),
            root.join("data").join("1234567890").join("library.json")
        );
    }

    #[test]
    fn empty_owner_falls_back_to_guest_folder() {
        let root = Path::new("root");
        let guest = root.join("data").join("guest").join("library.json");
        assert_eq!(store_path(root, "", "library"), guest);
    }

    #[test]
    fn empty_name_falls_back_to_store() {
        let root = Path::new("root");
        assert_eq!(
            store_path(root, "guest", ""),
            root.join("data").join("guest").join("store.json")
        );
    }

    #[test]
    fn names_with_different_punctuation_do_not_collide() {
        let root = Path::new("root");
        assert_ne!(
            store_path(root, "guest", "a.b"),
            store_path(root, "guest", "ab")
        );
        assert_eq!(
            store_path(root, "guest", "a.b"),
            root.join("data").join("guest").join("a~2eb.json")
        );
    }

    #[test]
    fn plain_names_are_unchanged() {
        let root = Path::new("root");
        assert_eq!(
            store_path(root, "guest", "my_store-1"),
            root.join("data").join("guest").join("my_store-1.json")
        );
    }

    #[tokio::test]
    async fn punctuated_name_round_trips_to_its_own_value() {
        let root = temp_root();
        write(root.path(), "guest", "a.b", &json!({ "dot": true }))
            .await
            .expect("write");
        assert_eq!(
            read(root.path(), "guest", "a.b").await,
            Some(json!({ "dot": true }))
        );
        assert_eq!(read(root.path(), "guest", "ab").await, None);
    }

    #[tokio::test]
    async fn writing_null_removes_the_store() {
        let root = temp_root();
        write(root.path(), "guest", "player", &json!({ "volume": 0.5 }))
            .await
            .expect("write");
        write(root.path(), "guest", "player", &Value::Null)
            .await
            .expect("null write");
        assert!(!store_path(root.path(), "guest", "player").exists());
        assert_eq!(read(root.path(), "guest", "player").await, None);
    }

    #[tokio::test]
    async fn writing_null_for_a_missing_store_is_ok() {
        let root = temp_root();
        assert_eq!(write(root.path(), "guest", "player", &Value::Null).await, Ok(()));
        assert_eq!(read(root.path(), "guest", "player").await, None);
    }

    #[test]
    fn traversal_stays_inside_the_data_folder() {
        let root = Path::new("root");
        let data = root.join("data");
        for (owner, name) in [
            ("..", ".."),
            ("../../evil", "../../secret"),
            ("a/b\\c", "d/e"),
            (".", "/absolute"),
        ] {
            let path = store_path(root, owner, name);
            assert!(path.starts_with(&data), "{path:?} escaped the data folder");
            assert_eq!(path.parent().and_then(Path::parent), Some(data.as_path()));
            assert_eq!(
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.ends_with(".json")),
                Some(true)
            );
        }
    }

    #[tokio::test]
    async fn traversal_write_lands_in_the_data_folder() {
        let root = temp_root();
        write(root.path(), "../..", "../escape", &json!({ "ok": true }))
            .await
            .expect("write");
        let entries: Vec<String> = std::fs::read_dir(root.path())
            .expect("read dir")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(entries, vec!["data".to_string()]);
        assert_eq!(
            read(root.path(), "../..", "../escape").await,
            Some(json!({ "ok": true }))
        );
    }
}

use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::Value;

pub const MAX_STORE_BYTES: usize = 16 * 1024 * 1024;
const RENAME_BACKOFF_MS: [u64; 4] = [40, 80, 120, 160];
const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

pub fn store_path(root: &Path, owner: &str, name: &str) -> PathBuf {
    root.join("data")
        .join(sanitize(owner, "guest"))
        .join(format!("{}.json", sanitize(name, "store")))
}

fn sanitize(value: &str, fallback: &str) -> String {
    let cleaned: String = value
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
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
            None
        }
    }
}

pub async fn write(root: &Path, owner: &str, name: &str, data: &Value) -> Result<(), String> {
    let path = store_path(root, owner, name);
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
        tokio::fs::write(&tmp, bytes).await?;
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
    tracing::warn!(%last, "rename failed, copying the temp file instead");
    tokio::fs::copy(tmp, target).await.map(|_| ())
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
            Some("owner".as_ref())
        );
        assert_eq!(path.file_name(), Some("library.json".as_ref()));
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
}

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

const OWNER: &str = "guest";
const STORE: &str = "crash-logs";
const VERSION: u64 = 1;
const MAX_LOGS: usize = 20;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CrashLog {
    pub at: u64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
struct Stored {
    logs: Vec<CrashLog>,
}

pub struct Service {
    root: PathBuf,
    stored: Mutex<Stored>,
}

impl Service {
    pub async fn load(root: PathBuf) -> Self {
        let stored = crate::persist::read(&root, OWNER, STORE)
            .await
            .and_then(|value| {
                serde_json::from_value::<Stored>(value.get("state").cloned().unwrap_or(serde_json::Value::Null)).ok()
            })
            .unwrap_or_default();
        Self {
            root,
            stored: Mutex::new(stored),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Stored> {
        self.stored
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    pub fn logs(&self) -> Vec<CrashLog> {
        self.lock().logs.clone()
    }

    pub async fn absorb_crash_file(&self, root: &Path) {
        let path = crash_file(root);
        let Ok(text) = std::fs::read_to_string(&path) else {
            return;
        };
        let mut imported: Vec<CrashLog> = Vec::new();
        for line in text.lines() {
            match parse_entry_line(line) {
                Some(log) => imported.push(log),
                None => {
                    if let Some(last) = imported.last_mut() {
                        last.message.push('\n');
                        last.message.push_str(line);
                    }
                }
            }
        }
        let _ = std::fs::remove_file(&path);
        if imported.is_empty() {
            return;
        }
        {
            let mut stored = self.lock();
            let mut merged: Vec<CrashLog> = imported.into_iter().rev().collect();
            merged.append(&mut stored.logs);
            merged.truncate(MAX_LOGS);
            stored.logs = merged;
        }
        self.write().await;
    }

    pub fn erase(&self) {
        self.lock().logs.clear();
    }

    pub async fn clear(&self) {
        {
            let mut stored = self.lock();
            stored.logs.clear();
        }
        self.write().await;
    }

    async fn write(&self) {
        let state = serde_json::to_value(self.lock().logs.clone()).unwrap_or(serde_json::Value::Null);
        let payload = serde_json::json!({ "state": { "logs": state }, "version": VERSION });
        if let Err(error) = crate::persist::write(&self.root, OWNER, STORE, &payload).await {
            tracing::warn!("crash log not saved: {error}");
        }
    }
}

fn parse_entry_line(line: &str) -> Option<CrashLog> {
    let rest = line.strip_prefix('[')?;
    let (stamp, message) = rest.split_once("] ")?;
    let at = chrono::DateTime::parse_from_rfc3339(stamp).ok()?.timestamp();
    Some(CrashLog {
        at: u64::try_from(at).ok()?,
        message: message.to_owned(),
    })
}

pub fn crash_file(root: &Path) -> PathBuf {
    root.join("crash.log")
}

static CRASH_ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_crash_root(root: PathBuf) {
    let mut guard = CRASH_ROOT
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    *guard = Some(root);
}

pub fn write_crash_file(root: &Path, message: &str) {
    let path = crash_file(root);
    let stamp = chrono::Utc::now().to_rfc3339();
    if let Err(error) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "[{stamp}] {message}")
        })
    {
        tracing::warn!("crash file not written: {error}");
    }
}

pub fn record_panic(message: &str) {
    let root = CRASH_ROOT
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone()
        .unwrap_or_else(std::env::temp_dir);
    write_crash_file(&root, message);
}

#[tauri::command]
pub fn crash_logs(crashes: tauri::State<'_, std::sync::Arc<Service>>) -> Vec<CrashLog> {
    crashes.logs()
}

#[tauri::command]
pub async fn crash_logs_clear(crashes: tauri::State<'_, std::sync::Arc<Service>>) -> Result<Vec<CrashLog>, String> {
    crashes.clear().await;
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_log_carries_the_time_and_the_message() {
        let log = CrashLog {
            at: 1_700_000_000,
            message: "boom".to_owned(),
        };
        assert_eq!(log.at, 1_700_000_000);
        assert_eq!(log.message, "boom");
    }

    #[test]
    fn the_crash_file_sits_in_the_app_data_folder() {
        let root = Path::new("/tmp/hushio");
        assert_eq!(crash_file(root), Path::new("/tmp/hushio/crash.log"));
    }

    #[test]
    fn a_written_crash_file_keeps_the_message() {
        let dir = tempfile::tempdir().expect("temp dir");
        write_crash_file(dir.path(), "the app fell over");
        let text = std::fs::read_to_string(crash_file(dir.path())).expect("crash file");
        assert!(text.contains("the app fell over"));
    }

    fn service(root: &Path) -> Service {
        tauri::async_runtime::block_on(Service::load(root.to_path_buf()))
    }

    fn absorb(root: &Path) -> Service {
        let crashes = service(root);
        tauri::async_runtime::block_on(crashes.absorb_crash_file(root));
        crashes
    }

    #[test]
    fn a_crash_file_is_absorbed_newest_first_and_removed() {
        let dir = tempfile::tempdir().expect("temp dir");
        write_crash_file(dir.path(), "first");
        write_crash_file(dir.path(), "second");
        let crashes = absorb(dir.path());
        let logs = crashes.logs();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].message, "second");
        assert_eq!(logs[1].message, "first");
        assert!(!crash_file(dir.path()).exists());
    }

    #[test]
    fn a_multi_line_crash_keeps_its_continuation_lines() {
        let dir = tempfile::tempdir().expect("temp dir");
        std::fs::write(
            crash_file(dir.path()),
            "[2026-11-01T10:00:00+00:00] panicked\nat src/lib.rs:1\n",
        )
        .expect("crash file");
        let crashes = absorb(dir.path());
        assert_eq!(crashes.logs()[0].message, "panicked\nat src/lib.rs:1");
        assert_eq!(crashes.logs()[0].at, 1_793_527_200);
    }

    #[test]
    fn the_list_is_capped_when_absorbing() {
        let dir = tempfile::tempdir().expect("temp dir");
        for index in 0..(MAX_LOGS + 5) {
            write_crash_file(dir.path(), &format!("crash {index}"));
        }
        let logs = absorb(dir.path()).logs();
        assert_eq!(logs.len(), MAX_LOGS);
        assert_eq!(logs[0].message, format!("crash {}", MAX_LOGS + 4));
    }

    #[test]
    fn logs_survive_a_restart() {
        let dir = tempfile::tempdir().expect("temp dir");
        write_crash_file(dir.path(), "kept");
        absorb(dir.path());
        let reloaded = service(dir.path());
        assert_eq!(reloaded.logs().len(), 1);
        assert_eq!(reloaded.logs()[0].message, "kept");
    }

    #[test]
    fn clear_empties_the_list_and_the_store() {
        let dir = tempfile::tempdir().expect("temp dir");
        write_crash_file(dir.path(), "one");
        let crashes = absorb(dir.path());
        tauri::async_runtime::block_on(crashes.clear());
        assert!(crashes.logs().is_empty());
        assert!(service(dir.path()).logs().is_empty());
    }

    #[test]
    fn erase_empties_the_list_in_memory() {
        let dir = tempfile::tempdir().expect("temp dir");
        write_crash_file(dir.path(), "gone");
        let crashes = absorb(dir.path());
        crashes.erase();
        assert!(crashes.logs().is_empty());
    }
}

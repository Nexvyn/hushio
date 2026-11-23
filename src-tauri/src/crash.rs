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
        if imported.is_empty() {
            let _ = std::fs::remove_file(&path);
            return;
        }
        {
            let mut stored = self.lock();
            let mut merged: Vec<CrashLog> = imported.into_iter().rev().collect();
            merged.append(&mut stored.logs);
            merged.truncate(MAX_LOGS);
            stored.logs = merged;
        }
        if self.write().await {
            let _ = std::fs::remove_file(&path);
        }
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

    pub async fn report(&self, message: &str) {
        self.report_with(message, &home_dir(), now_unix()).await;
    }

    async fn report_with(&self, message: &str, home: &str, at: u64) {
        let text = format!("[renderer] {}", cap(&redact_with(message, home)));
        {
            let mut stored = self.lock();
            stored.logs.insert(0, CrashLog { at, message: text });
            stored.logs.truncate(MAX_LOGS);
        }
        self.write().await;
    }

    async fn write(&self) -> bool {
        let state = serde_json::to_value(self.lock().logs.clone()).unwrap_or(serde_json::Value::Null);
        let payload = serde_json::json!({ "state": { "logs": state }, "version": VERSION });
        match crate::persist::write(&self.root, OWNER, STORE, &payload).await {
            Ok(()) => true,
            Err(error) => {
                tracing::warn!("crash log not saved: {error}");
                false
            }
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

const MAX_MESSAGE: usize = 4000;

static CRASH_ROOT: Mutex<Option<PathBuf>> = Mutex::new(None);
static EARLY: Mutex<Vec<String>> = Mutex::new(Vec::new());

fn lock_slot<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn record_into(root: &Mutex<Option<PathBuf>>, early: &Mutex<Vec<String>>, message: &str) {
    let guard = lock_slot(root);
    match guard.as_ref() {
        Some(path) => write_crash_file(path, message),
        None => lock_slot(early).push(message.to_owned()),
    }
}

fn bind_root(root: &Mutex<Option<PathBuf>>, early: &Mutex<Vec<String>>, path: PathBuf) {
    let mut guard = lock_slot(root);
    let pending = std::mem::take(&mut *lock_slot(early));
    for message in pending {
        write_crash_file(&path, &message);
    }
    *guard = Some(path);
}

pub fn set_crash_root(root: PathBuf) {
    bind_root(&CRASH_ROOT, &EARLY, root);
}

pub fn record_panic(message: &str) {
    record_into(&CRASH_ROOT, &EARLY, message);
}

pub fn write_crash_file(root: &Path, message: &str) {
    let path = crash_file(root);
    let stamp = chrono::Utc::now().to_rfc3339();
    let line = format!("[{stamp}] {}\n", cap(&redact(message)));
    if let Err(error) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| {
            use std::io::Write;
            file.write_all(line.as_bytes())
        })
    {
        tracing::warn!("crash file not written: {error}");
    }
}

fn cap(message: &str) -> String {
    if message.chars().count() <= MAX_MESSAGE {
        return message.to_owned();
    }
    let mut capped: String = message.chars().take(MAX_MESSAGE - 1).collect();
    capped.push('…');
    capped
}

fn home_dir() -> String {
    let key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    std::env::var(key).unwrap_or_default()
}

pub fn redact(message: &str) -> String {
    redact_with(message, &home_dir())
}

fn redact_with(message: &str, home: &str) -> String {
    if home.is_empty() {
        return message.to_owned();
    }
    [home.to_owned(), home.replace('\\', "/"), home.replace('/', "\\")]
        .iter()
        .fold(message.to_owned(), |text, variant| text.replace(variant.as_str(), "~"))
}

fn now_unix() -> u64 {
    u64::try_from(chrono::Utc::now().timestamp()).unwrap_or(0)
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

#[tauri::command]
pub async fn crash_report(crashes: tauri::State<'_, std::sync::Arc<Service>>, message: String) -> Result<(), String> {
    crashes.report(&message).await;
    Ok(())
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

    #[test]
    fn the_home_folder_is_replaced_in_every_slash_style() {
        let home = "C:\\Users\\amang";
        assert_eq!(
            redact_with("at C:\\Users\\amang\\src\\x.rs and C:/Users/amang/y", home),
            "at ~\\src\\x.rs and ~/y"
        );
        assert_eq!(redact_with("/home/amang/music", "/home/amang"), "~/music");
    }

    #[test]
    fn an_empty_home_redacts_nothing() {
        assert_eq!(redact_with("C:\\Users\\amang", ""), "C:\\Users\\amang");
    }

    #[test]
    fn a_long_message_is_cut_on_a_char_boundary() {
        let long = "é".repeat(MAX_MESSAGE + 10);
        let capped = cap(&long);
        assert_eq!(capped.chars().count(), MAX_MESSAGE);
        assert!(capped.ends_with('…'));
        assert_eq!(cap("short"), "short");
    }

    #[test]
    fn a_panic_before_the_root_is_known_is_kept_until_it_is() {
        let slot = Mutex::new(None);
        let early = Mutex::new(Vec::new());
        record_into(&slot, &early, "too early");
        let dir = tempfile::tempdir().expect("temp dir");
        bind_root(&slot, &early, dir.path().to_path_buf());
        let text = std::fs::read_to_string(crash_file(dir.path())).expect("crash file");
        assert!(text.contains("too early"));
        assert!(lock_slot(&early).is_empty());
    }

    #[test]
    fn a_crash_report_is_redacted_prefixed_and_kept_first() {
        let dir = tempfile::tempdir().expect("temp dir");
        let crashes = service(dir.path());
        let long = "x".repeat(MAX_MESSAGE + 5);
        tauri::async_runtime::block_on(crashes.report_with("C:\\Users\\amang\\boom", "C:\\Users\\amang", 42));
        tauri::async_runtime::block_on(crashes.report_with(&long, "C:\\Users\\amang", 43));
        let logs = crashes.logs();
        assert_eq!(logs[0].at, 43);
        assert_eq!(logs[0].message.chars().count(), "[renderer] ".len() + MAX_MESSAGE);
        assert_eq!(logs[1], CrashLog { at: 42, message: "[renderer] ~\\boom".to_owned() });
        assert_eq!(service(dir.path()).logs().len(), 2);
    }

    #[test]
    fn crash_reports_are_capped_at_the_list_limit() {
        let dir = tempfile::tempdir().expect("temp dir");
        let crashes = service(dir.path());
        for index in 0..(MAX_LOGS + 3) {
            tauri::async_runtime::block_on(crashes.report_with(&format!("r{index}"), "", index as u64));
        }
        let logs = service(dir.path()).logs();
        assert_eq!(logs.len(), MAX_LOGS);
        assert_eq!(logs[0].message, format!("[renderer] r{}", MAX_LOGS + 2));
    }
}

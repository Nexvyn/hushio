mod persist;

use std::path::PathBuf;

use tauri::{AppHandle, Manager, State};
use tracing::Subscriber;
use tracing_subscriber::fmt::format::Writer;
use tracing_subscriber::fmt::{FmtContext, FormatEvent, FormatFields};
use tracing_subscriber::registry::LookupSpan;

const APP_SLUG: &str = "hushio";
const DATA_DIR_ENV: &str = "HUSHIO_DATA_DIR";

struct DataPaths {
    root: PathBuf,
}

struct LogPrefix;

impl<S, N> FormatEvent<S, N> for LogPrefix
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: Writer<'_>,
        event: &tracing::Event<'_>,
    ) -> std::fmt::Result {
        write!(writer, "[{APP_SLUG}] ")?;
        ctx.format_fields(writer.by_ref(), event)?;
        writeln!(writer)
    }
}

fn data_root(app: &AppHandle) -> tauri::Result<PathBuf> {
    if let Some(dir) = std::env::var_os(DATA_DIR_ENV) {
        return Ok(PathBuf::from(dir));
    }
    #[cfg(target_os = "linux")]
    {
        return Ok(app.path().data_dir()?.join(APP_SLUG));
    }
    #[cfg(not(target_os = "linux"))]
    {
        app.path().app_data_dir()
    }
}

fn ensure_install_marker(root: &std::path::Path) -> bool {
    let marker = root.join(format!(".{APP_SLUG}-install"));
    if marker.exists() {
        return false;
    }
    match std::fs::write(&marker, b"") {
        Ok(()) => {
            tracing::info!(path = %marker.display(), "created install marker");
            true
        }
        Err(error) => {
            tracing::warn!(%error, path = %marker.display(), "could not create install marker");
            false
        }
    }
}

fn prepare_data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    let root = data_root(app)?;
    let data = root.join("data");
    if let Err(error) = std::fs::create_dir_all(&data) {
        tracing::warn!(%error, path = %data.display(), "could not create data folder");
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(error) = std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))
        {
            tracing::warn!(%error, path = %root.display(), "could not restrict data folder");
        }
    }
    ensure_install_marker(&root);
    tracing::info!(path = %root.display(), "app data folder ready");
    Ok(root)
}

#[tauri::command]
async fn persist_read(
    state: State<'_, DataPaths>,
    name: String,
    owner: Option<String>,
) -> Result<Option<serde_json::Value>, String> {
    Ok(persist::read(&state.root, owner.as_deref().unwrap_or("guest"), &name).await)
}

#[tauri::command]
async fn persist_write(
    state: State<'_, DataPaths>,
    name: String,
    data: serde_json::Value,
    owner: Option<String>,
) -> Result<bool, String> {
    persist::write(
        &state.root,
        owner.as_deref().unwrap_or("guest"),
        &name,
        &data,
    )
    .await?;
    Ok(true)
}

#[tauri::command]
fn os_scroll_direction() -> Option<bool> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let output = Command::new("reg")
            .args([
                "query",
                "HKCU\\Control Panel\\Desktop",
                "/v",
                "WheelScrollChars",
            ])
            .creation_flags(0x08000000)
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        let line = text
            .lines()
            .find(|line| line.contains("WheelScrollChars"))?;
        let value = line
            .split("REG_SZ")
            .nth(1)?
            .trim()
            .split_whitespace()
            .next()?;
        let amount = value.parse::<i32>().ok()?;
        return Some(amount < 0);
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let output = Command::new("defaults")
            .args(["read", "-g", "com.apple.swipescrolldirection"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&output.stdout);
        return Some(text.trim() == "1");
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .event_format(LogPrefix)
        .with_max_level(tracing::Level::INFO)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            let root = prepare_data_dir(app.handle())?;
            app.manage(DataPaths { root });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            os_scroll_direction,
            persist_read,
            persist_write
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct Buffer(Arc<Mutex<Vec<u8>>>);

    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().expect("lock").extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn log_lines_start_with_slug_prefix() {
        let buffer = Buffer::default();
        let writer = buffer.clone();
        let subscriber = tracing_subscriber::fmt()
            .event_format(LogPrefix)
            .with_writer(move || writer.clone())
            .finish();
        tracing::subscriber::with_default(subscriber, || {
            tracing::info!("app data folder ready");
        });
        let output = String::from_utf8(buffer.0.lock().expect("lock").clone()).expect("utf8");
        assert!(output.starts_with("[hushio] "), "{output}");
    }

    #[test]
    fn install_marker_is_created_once() {
        let root = tempfile::tempdir().expect("temp dir");
        assert!(ensure_install_marker(root.path()));
        assert!(root.path().join(".hushio-install").exists());
        assert!(!ensure_install_marker(root.path()));
    }
}

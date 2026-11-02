use serde_json::Value;
use tauri::{AppHandle, Manager, Window, WindowEvent};

use crate::{persist, tray, DataPaths};

pub const MAIN: &str = "main";
const OWNER: &str = "guest";
const SETTINGS: &str = "settings";

#[derive(Debug, PartialEq, Eq)]
pub enum CloseAction {
    Close,
    Tray,
}

pub fn close_action(windows: bool, quitting: bool, close_to_tray: bool, tray_shown: bool) -> CloseAction {
    if windows && !quitting && close_to_tray && tray_shown {
        CloseAction::Tray
    } else {
        CloseAction::Close
    }
}

pub fn close_to_tray_setting(settings: Option<&Value>) -> bool {
    settings
        .and_then(|value| value["state"]["closeToTray"].as_bool())
        .unwrap_or(true)
}

pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != MAIN {
        return;
    }
    let app = window.app_handle();
    let (Some(tray), Some(paths)) = (app.try_state::<tray::Tray>(), app.try_state::<DataPaths>()) else {
        return;
    };
    let settings = tauri::async_runtime::block_on(persist::read(&paths.root, OWNER, SETTINGS));
    let close_to_tray = close_to_tray_setting(settings.as_ref());
    if close_action(cfg!(target_os = "windows"), tray.quitting(), close_to_tray, tray.shown())
        == CloseAction::Tray
    {
        api.prevent_close();
        tray::send_command(app, "pause");
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn close_hides_only_on_windows_with_the_setting_and_a_tray() {
        assert_eq!(close_action(true, false, true, true), CloseAction::Tray);
    }

    #[test]
    fn close_quits_when_the_setting_is_off() {
        assert_eq!(close_action(true, false, false, true), CloseAction::Close);
    }

    #[test]
    fn close_quits_when_there_is_no_tray() {
        assert_eq!(close_action(true, false, true, false), CloseAction::Close);
    }

    #[test]
    fn close_quits_when_the_app_is_quitting() {
        assert_eq!(close_action(true, true, true, true), CloseAction::Close);
    }

    #[test]
    fn close_quits_on_linux_even_with_the_setting_and_a_tray() {
        assert_eq!(close_action(false, false, true, true), CloseAction::Close);
    }

    #[test]
    fn close_to_tray_defaults_to_on() {
        assert!(close_to_tray_setting(None));
        assert!(close_to_tray_setting(Some(&json!({ "state": {} }))));
        assert!(close_to_tray_setting(Some(&json!({ "state": { "closeToTray": "no" } }))));
    }

    #[test]
    fn close_to_tray_reads_the_stored_value() {
        assert!(!close_to_tray_setting(Some(&json!({ "state": { "closeToTray": false } }))));
        assert!(close_to_tray_setting(Some(&json!({ "state": { "closeToTray": true } }))));
    }

    #[tokio::test]
    async fn the_setting_is_read_from_the_guest_settings_file() {
        let dir = tempfile::tempdir().expect("temp dir");
        persist::write(dir.path(), OWNER, SETTINGS, &json!({ "state": { "closeToTray": false }, "version": 0 }))
            .await
            .expect("write");
        let stored = persist::read(dir.path(), OWNER, SETTINGS).await;
        assert!(!close_to_tray_setting(stored.as_ref()));
    }
}

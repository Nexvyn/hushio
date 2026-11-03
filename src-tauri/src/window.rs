use serde_json::Value;
use tauri::{AppHandle, LogicalSize, Manager, Runtime, Window, WebviewWindow, WindowEvent};
use tauri::plugin::TauriPlugin;
use tauri_plugin_window_state::{StateFlags, WindowExt};

use crate::{persist, tray, DataPaths};

pub const MAIN: &str = "main";
const OWNER: &str = "guest";
const SETTINGS: &str = "settings";
const STATE_FILE: &str = "window-state.json";
const STATE_FLAGS: StateFlags = StateFlags::SIZE.union(StateFlags::POSITION).union(StateFlags::MAXIMIZED);
const DEFAULT_WIDTH: f64 = 1280.0;
const DEFAULT_HEIGHT: f64 = 820.0;
const MIN_VISIBLE_PX: i64 = 56;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
}

pub fn visible_enough(window: Rect, area: Rect) -> bool {
    let width = (window.x + window.width).min(area.x + area.width) - window.x.max(area.x);
    let height = (window.y + window.height).min(area.y + area.height) - window.y.max(area.y);
    width >= MIN_VISIBLE_PX && height >= MIN_VISIBLE_PX
}

pub fn on_any_area(window: Rect, areas: &[Rect]) -> bool {
    areas.iter().any(|area| visible_enough(window, *area))
}

pub fn state_plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_window_state::Builder::new()
        .with_state_flags(STATE_FLAGS)
        .with_filename(STATE_FILE)
        .skip_initial_state(MAIN)
        .build()
}

pub fn restore_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    let had_state = app
        .path()
        .app_config_dir()
        .is_ok_and(|dir| dir.join(STATE_FILE).exists());
    if let Err(error) = window.restore_state(STATE_FLAGS) {
        tracing::warn!(%error, "could not restore the window state");
    }
    keep_on_screen(&window);
    if !had_state && !cfg!(target_os = "macos") {
        let _ = window.maximize();
    }
}

fn keep_on_screen(window: &WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    let (Ok(position), Ok(size), Ok(monitors)) =
        (window.outer_position(), window.outer_size(), window.available_monitors())
    else {
        return;
    };
    let areas: Vec<Rect> = monitors
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            Rect {
                x: i64::from(area.position.x),
                y: i64::from(area.position.y),
                width: i64::from(area.size.width),
                height: i64::from(area.size.height),
            }
        })
        .collect();
    let restored = Rect {
        x: i64::from(position.x),
        y: i64::from(position.y),
        width: i64::from(size.width),
        height: i64::from(size.height),
    };
    if areas.is_empty() || on_any_area(restored, &areas) {
        return;
    }
    let _ = window.set_size(LogicalSize::new(DEFAULT_WIDTH, DEFAULT_HEIGHT));
    let _ = window.center();
}

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

    fn screen(x: i64, y: i64) -> Rect {
        Rect { x, y, width: 1920, height: 1040 }
    }

    #[test]
    fn a_window_needs_56_px_of_overlap_on_both_axes() {
        let area = screen(0, 0);
        assert!(visible_enough(Rect { x: 100, y: 100, width: 1000, height: 640 }, area));
        assert!(visible_enough(Rect { x: 1920 - 56, y: 1040 - 56, width: 1000, height: 640 }, area));
        assert!(!visible_enough(Rect { x: 1920 - 55, y: 100, width: 1000, height: 640 }, area));
        assert!(!visible_enough(Rect { x: 100, y: 1040 - 55, width: 1000, height: 640 }, area));
        assert!(!visible_enough(Rect { x: -5000, y: 100, width: 1000, height: 640 }, area));
    }

    #[test]
    fn a_window_on_a_second_screen_is_kept_when_that_screen_is_known() {
        let window = Rect { x: 2100, y: 200, width: 1280, height: 820 };
        assert!(!on_any_area(window, &[screen(0, 0)]));
        assert!(on_any_area(window, &[screen(0, 0), screen(1920, 0)]));
        assert!(!on_any_area(window, &[]));
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

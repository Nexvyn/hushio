#![cfg_attr(not(target_os = "macos"), allow(dead_code, unused_imports))]

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, CloseRequestApi, Manager, WebviewWindow, WindowEvent};

const MAIN_WINDOW: &str = "main";

static QUITTING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    Quit,
    LeaveFullscreen,
    Hide,
}

pub fn close_action(quitting: bool, fullscreen: bool) -> CloseAction {
    if quitting {
        CloseAction::Quit
    } else if fullscreen {
        CloseAction::LeaveFullscreen
    } else {
        CloseAction::Hide
    }
}

pub fn mark_quitting() {
    QUITTING.store(true, Ordering::SeqCst);
}

#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let handle = main.clone();
    main.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            on_close_requested(&handle, api);
        }
    });
}

#[cfg(target_os = "macos")]
fn on_close_requested(window: &WebviewWindow, api: &CloseRequestApi) {
    let fullscreen = window.is_fullscreen().unwrap_or(false);
    match close_action(QUITTING.load(Ordering::SeqCst), fullscreen) {
        CloseAction::Quit => {}
        CloseAction::LeaveFullscreen => {
            api.prevent_close();
            if let Err(error) = window.set_fullscreen(false) {
                tracing::warn!(%error, "could not leave full screen");
            }
        }
        CloseAction::Hide => {
            api.prevent_close();
            if let Err(error) = window.hide() {
                tracing::warn!(%error, "could not hide main window");
            }
        }
    }
}

#[cfg(target_os = "macos")]
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let shown = window
        .unminimize()
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus());
    if let Err(error) = shown {
        tracing::warn!(%error, "could not show main window");
    }
}

#[cfg(test)]
mod tests {
    use super::{close_action, CloseAction};

    #[test]
    fn quit_always_closes() {
        assert_eq!(close_action(true, false), CloseAction::Quit);
        assert_eq!(close_action(true, true), CloseAction::Quit);
    }

    #[test]
    fn fullscreen_leaves_fullscreen_before_hiding() {
        assert_eq!(close_action(false, true), CloseAction::LeaveFullscreen);
    }

    #[test]
    fn windowed_close_hides_and_keeps_playback() {
        assert_eq!(close_action(false, false), CloseAction::Hide);
    }
}

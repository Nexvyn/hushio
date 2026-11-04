#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Session {
    X11,
    Wayland,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    pub session: &'static str,
    pub store_position: bool,
    pub always_on_top: bool,
}

pub struct SessionState(pub Session);

pub fn session_from_display(type_name: &str) -> Session {
    match type_name {
        "GdkX11Display" => Session::X11,
        "GdkWaylandDisplay" => Session::Wayland,
        _ => Session::Unknown,
    }
}

pub fn rules(session: Session, desktop: &str) -> Rules {
    let kde = desktop.split(':').any(|part| part.eq_ignore_ascii_case("KDE"));
    let (label, always_on_top) = match session {
        Session::X11 => ("x11", true),
        Session::Wayland => ("wayland", kde),
        Session::Unknown => ("unknown", false),
    };
    Rules {
        session: label,
        store_position: session == Session::X11,
        always_on_top,
    }
}

#[cfg(target_os = "linux")]
fn detect(app: &AppHandle) -> Session {
    use gtk::glib::prelude::ObjectExt;
    use gtk::prelude::WidgetExt;

    let Some(window) = app.get_webview_window(crate::window::MAIN) else {
        return Session::Unknown;
    };
    let Ok(gtk_window) = window.gtk_window() else {
        return Session::Unknown;
    };
    let display = gtk_window.display();
    session_from_display(display.type_().name())
}

#[cfg(not(target_os = "linux"))]
fn detect(_app: &AppHandle) -> Session {
    Session::Unknown
}

pub fn setup(app: &AppHandle) {
    let session = detect(app);
    tracing::info!(session = rules(session, "").session, "display session");
    app.manage(SessionState(session));
}

#[tauri::command]
pub fn linux_session_rules(state: State<'_, SessionState>) -> Rules {
    rules(state.0, &std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gtk_display_type_names_pick_the_session() {
        assert_eq!(session_from_display("GdkX11Display"), Session::X11);
        assert_eq!(session_from_display("GdkWaylandDisplay"), Session::Wayland);
        assert_eq!(session_from_display("GdkBroadwayDisplay"), Session::Unknown);
    }

    #[test]
    fn x11_keeps_the_window_position_and_stays_on_top() {
        let x11 = rules(Session::X11, "GNOME");
        assert!(x11.store_position);
        assert!(x11.always_on_top);
        assert_eq!(x11.session, "x11");
    }

    #[test]
    fn wayland_never_stores_position_and_stays_on_top_only_on_kde() {
        let kde = rules(Session::Wayland, "KDE");
        assert!(!kde.store_position);
        assert!(kde.always_on_top);
        let gnome = rules(Session::Wayland, "ubuntu:GNOME");
        assert!(!gnome.store_position);
        assert!(!gnome.always_on_top);
        assert!(!rules(Session::Wayland, "sway").always_on_top);
    }

    #[test]
    fn unknown_sessions_get_the_conservative_rules() {
        let unknown = rules(Session::Unknown, "KDE");
        assert!(!unknown.store_position);
        assert!(!unknown.always_on_top);
    }

    #[test]
    fn desktop_names_match_whole_entries_only() {
        assert!(!rules(Session::Wayland, "plasmaKDE").always_on_top);
        assert!(rules(Session::Wayland, "GNOME:KDE").always_on_top);
    }
}

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, Url, Webview, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};
use tauri::window::Color;

use crate::{persist, window, window::Rect, DataPaths, APP_NAME};

pub const LABEL: &str = "pip";
const STORE: &str = "pip-rect";
const OWNER: &str = "guest";
const ROUTE: &str = "index.html?window=pip";
const SAVE_DELAY: Duration = Duration::from_millis(400);
const REST_MARGIN: i64 = 16;
const DEFAULT_W: i64 = 352;
const DEFAULT_H: i64 = 353;
const MIN_W: i64 = 262;
const MIN_H: i64 = 233;
const MAX_W: i64 = 578;
const MAX_H: i64 = 574;
const BAR_W: i64 = 320;
const BAR_H: i64 = 110;
const FALLBACK: Rect = Rect { x: 0, y: 0, width: 1280, height: 800 };

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stored {
    pub rect: Option<Rect>,
    pub compact: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Saved {
    pub rect: Rect,
    pub compact: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OpenTarget {
    Album,
    Artist,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum PipCommand {
    Toggle,
    Next,
    Prev,
    Seek { sec: f64 },
    Volume { v: f64 },
    Mute,
    Shuffle,
    Repeat,
    Like,
    Open { to: OpenTarget },
}

#[derive(Default)]
pub struct Pip {
    current: Mutex<Option<Saved>>,
    pending: AtomicU64,
}

pub fn size_for(compact: bool) -> (i64, i64) {
    if compact {
        (BAR_W, BAR_H)
    } else {
        (DEFAULT_W, DEFAULT_H)
    }
}

pub fn limits(compact: bool) -> ((i64, i64), (i64, i64)) {
    if compact {
        ((BAR_W, BAR_H), (BAR_W, BAR_H))
    } else {
        ((MIN_W, MIN_H), (MAX_W, MAX_H))
    }
}

pub fn clamp_size(w: i64, h: i64) -> (i64, i64) {
    (w.clamp(MIN_W, MAX_W), h.clamp(MIN_H, MAX_H))
}

pub fn parse(value: Option<&Value>) -> Stored {
    let number = |key: &str| {
        value
            .and_then(|stored| stored.get(key))
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite())
    };
    let size = |key: &str, fallback: i64| {
        number(key)
            .filter(|n| *n > 0.0)
            .map_or(fallback, |n| n.round() as i64)
    };
    let (width, height) = clamp_size(size("w", DEFAULT_W), size("h", DEFAULT_H));
    let rect = match (number("x"), number("y")) {
        (Some(x), Some(y)) => Some(Rect {
            x: x.round() as i64,
            y: y.round() as i64,
            width,
            height,
        }),
        _ => None,
    };
    let compact = value
        .and_then(|stored| stored.get("compact"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Stored { rect, compact }
}

pub fn stored_json(saved: Saved) -> Value {
    json!({
        "x": saved.rect.x,
        "y": saved.rect.y,
        "w": saved.rect.width,
        "h": saved.rect.height,
        "compact": saved.compact,
    })
}

pub fn default_rect(area: Rect, w: i64, h: i64) -> Rect {
    Rect {
        x: area.x + area.width - w - REST_MARGIN,
        y: area.y + area.height - h - REST_MARGIN,
        width: w,
        height: h,
    }
}

pub fn clamp_inside(rect: Rect, area: Rect) -> Rect {
    let x = if rect.width >= area.width {
        area.x
    } else {
        rect.x.clamp(area.x, area.x + area.width - rect.width)
    };
    let y = if rect.height >= area.height {
        area.y
    } else {
        rect.y.clamp(area.y, area.y + area.height - rect.height)
    };
    Rect { x, y, ..rect }
}

pub fn plan(stored: Stored, areas: &[Rect], primary: Rect) -> Rect {
    let Some(rect) = stored.rect else {
        return default_rect(primary, DEFAULT_W, DEFAULT_H);
    };
    if !window::on_any_area(rect, areas) {
        return default_rect(primary, rect.width, rect.height);
    }
    let area = areas
        .iter()
        .find(|area| window::visible_enough(rect, **area))
        .copied()
        .unwrap_or(primary);
    clamp_inside(rect, area)
}

pub fn bar_box(square: Rect) -> Rect {
    Rect {
        x: square.x + square.width - BAR_W,
        y: square.y + square.height - BAR_H,
        width: BAR_W,
        height: BAR_H,
    }
}

pub fn square_at(bar: Rect, w: i64, h: i64) -> Rect {
    Rect {
        x: bar.x + bar.width - w,
        y: bar.y + bar.height - h,
        width: w,
        height: h,
    }
}

pub fn navigation_allowed(url: &Url) -> bool {
    let local_host = matches!(url.host_str(), Some("localhost" | "tauri.localhost"));
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => local_host,
        _ => false,
    }
}

pub fn always_on_top_supported(linux: bool, wayland: bool, desktop: &str) -> bool {
    !(linux && wayland && desktop.to_ascii_uppercase().contains("GNOME"))
}

pub fn sender_allowed(label: &str, allowed: &[&str]) -> bool {
    allowed.contains(&label)
}

fn top_allowed() -> bool {
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|value| value == "wayland");
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    always_on_top_supported(cfg!(target_os = "linux"), wayland, &desktop)
}

fn logical_area(monitor: &Monitor) -> Rect {
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    Rect {
        x: (f64::from(area.position.x) / scale).round() as i64,
        y: (f64::from(area.position.y) / scale).round() as i64,
        width: (f64::from(area.size.width) / scale).round() as i64,
        height: (f64::from(area.size.height) / scale).round() as i64,
    }
}

fn screens(app: &AppHandle) -> (Vec<Rect>, Rect) {
    let areas: Vec<Rect> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(logical_area)
        .collect();
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|monitor| logical_area(&monitor))
        .or_else(|| areas.first().copied())
        .unwrap_or(FALLBACK);
    (areas, primary)
}

fn logical_rect(win: &WebviewWindow) -> Option<Rect> {
    let scale = win.scale_factor().ok()?;
    let position = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    Some(Rect {
        x: (f64::from(position.x) / scale).round() as i64,
        y: (f64::from(position.y) / scale).round() as i64,
        width: (f64::from(size.width) / scale).round() as i64,
        height: (f64::from(size.height) / scale).round() as i64,
    })
}

fn shown(win: &WebviewWindow) -> bool {
    win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false)
}

fn current(app: &AppHandle) -> Option<Saved> {
    *app.state::<Pip>().current.lock().unwrap_or_else(PoisonError::into_inner)
}

fn set_current(app: &AppHandle, saved: Option<Saved>) {
    *app.state::<Pip>().current.lock().unwrap_or_else(PoisonError::into_inner) = saved;
}

fn record(app: &AppHandle) -> Option<Saved> {
    let win = app.get_webview_window(LABEL)?;
    if win.is_minimized().unwrap_or(true) {
        return None;
    }
    let before = current(app)?;
    let rect = logical_rect(&win)?;
    let square = if before.compact {
        square_at(rect, before.rect.width, before.rect.height)
    } else {
        rect
    };
    let saved = Saved {
        rect: square,
        compact: before.compact,
    };
    set_current(app, Some(saved));
    Some(saved)
}

fn schedule_save(app: &AppHandle) {
    let generation = app.state::<Pip>().pending.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SAVE_DELAY).await;
        if app.state::<Pip>().pending.load(Ordering::SeqCst) != generation {
            return;
        }
        if let Some(saved) = record(&app) {
            let root = app.state::<DataPaths>().root.clone();
            let _ = persist::write(&root, OWNER, STORE, &stored_json(saved)).await;
        }
    });
}

pub fn open(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let (areas, primary) = screens(app);
    let root = app.state::<DataPaths>().root.clone();
    let stored = parse(tauri::async_runtime::block_on(persist::read(&root, OWNER, STORE)).as_ref());
    let square = plan(stored, &areas, primary);
    let (w, h) = size_for(stored.compact);
    let at = if stored.compact { bar_box(square) } else { square };
    let ((min_w, min_h), (max_w, max_h)) = limits(stored.compact);
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(ROUTE.into()))
        .title(format!("{APP_NAME} Miniplayer"))
        .position(at.x as f64, at.y as f64)
        .inner_size(w as f64, h as f64)
        .min_inner_size(min_w as f64, min_h as f64)
        .max_inner_size(max_w as f64, max_h as f64)
        .decorations(false)
        .always_on_top(top_allowed())
        .visible(false)
        .resizable(true)
        .minimizable(true)
        .maximizable(false)
        .skip_taskbar(false)
        .shadow(true)
        .background_color(Color(0, 0, 0, 255))
        .on_navigation(navigation_allowed)
        .build()?;
    set_current(
        app,
        Some(Saved {
            rect: square,
            compact: stored.compact,
        }),
    );
    Ok(())
}

pub fn ready(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.show();
    }
    let _ = app.emit_to(window::MAIN, "pip:open-changed", true);
    let _ = app.emit_to(window::MAIN, "pip:need-state", ());
}

pub fn toggle(app: &AppHandle) -> tauri::Result<bool> {
    match app.get_webview_window(LABEL) {
        Some(win) if shown(&win) => {
            let _ = win.close();
            Ok(false)
        }
        _ => {
            open(app)?;
            Ok(true)
        }
    }
}

pub fn set_compact(app: &AppHandle, on: bool) -> tauri::Result<()> {
    let (Some(win), Some(saved)) = (app.get_webview_window(LABEL), record(app)) else {
        return Ok(());
    };
    if saved.compact == on {
        return Ok(());
    }
    set_current(app, Some(Saved { rect: saved.rect, compact: on }));
    let ((min_w, min_h), (max_w, max_h)) = limits(on);
    win.set_min_size(Some(LogicalSize::new(min_w as f64, min_h as f64)))?;
    win.set_max_size(Some(LogicalSize::new(max_w as f64, max_h as f64)))?;
    if on {
        let bar = bar_box(saved.rect);
        win.set_size(LogicalSize::new(BAR_W as f64, BAR_H as f64))?;
        win.set_position(LogicalPosition::new(bar.x as f64, bar.y as f64))?;
    } else {
        let square = saved.rect;
        win.set_size(LogicalSize::new(square.width as f64, square.height as f64))?;
        win.set_position(LogicalPosition::new(square.x as f64, square.y as f64))?;
    }
    Ok(())
}

fn require(webview: &Webview, allowed: &[&str]) -> Result<(), String> {
    if sender_allowed(webview.label(), allowed) {
        Ok(())
    } else {
        Err(format!("{} may not call this command", webview.label()))
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != LABEL {
        return;
    }
    let app = window.app_handle();
    match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => schedule_save(app),
        WindowEvent::CloseRequested { .. } => {
            if let Some(saved) = record(app) {
                let root = app.state::<DataPaths>().root.clone();
                let _ = tauri::async_runtime::block_on(persist::write(&root, OWNER, STORE, &stored_json(saved)));
            }
        }
        WindowEvent::Destroyed => {
            let _ = app.emit_to(window::MAIN, "pip:open-changed", false);
        }
        _ => {}
    }
}

#[tauri::command]
pub async fn pip_toggle(app: AppHandle, webview: Webview) -> Result<bool, String> {
    require(&webview, &[window::MAIN, LABEL])?;
    toggle(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pip_is_open(app: AppHandle, webview: Webview) -> bool {
    sender_allowed(webview.label(), &[window::MAIN, LABEL])
        && app.get_webview_window(LABEL).is_some_and(|win| shown(&win))
}

#[tauri::command]
pub fn pip_close(app: AppHandle, webview: Webview) -> Result<(), String> {
    require(&webview, &[LABEL])?;
    if let Some(win) = app.get_webview_window(LABEL) {
        win.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pip_minimize(app: AppHandle, webview: Webview) -> Result<(), String> {
    require(&webview, &[LABEL])?;
    if let Some(win) = app.get_webview_window(LABEL) {
        win.minimize().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn pip_set_compact(app: AppHandle, webview: Webview, on: bool) -> Result<(), String> {
    require(&webview, &[LABEL])?;
    set_compact(&app, on).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pip_show_main(app: AppHandle, webview: Webview) -> Result<(), String> {
    require(&webview, &[LABEL])?;
    window::show_main(&app);
    Ok(())
}

#[tauri::command]
pub fn pip_ready(app: AppHandle, webview: Webview) -> Result<(), String> {
    require(&webview, &[LABEL])?;
    ready(&app);
    Ok(())
}

#[tauri::command]
pub fn pip_send_state(app: AppHandle, webview: Webview, payload: Value) -> Result<(), String> {
    require(&webview, &[window::MAIN])?;
    let _ = app.emit_to(LABEL, "pip:state", payload);
    Ok(())
}

#[tauri::command]
pub fn pip_send_command(app: AppHandle, webview: Webview, payload: Value) -> Result<(), String> {
    require(&webview, &[LABEL])?;
    let command: PipCommand = serde_json::from_value(payload).map_err(|error| error.to_string())?;
    let _ = app.emit_to(window::MAIN, "pip:command", command);
    Ok(())
}

#[tauri::command]
pub fn pip_session_erased(app: AppHandle, webview: Webview) -> Result<(), String> {
    require(&webview, &[window::MAIN])?;
    let _ = app.emit_to(LABEL, "session:erased", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::from_value;

    const SCREEN: Rect = Rect { x: 0, y: 0, width: 1920, height: 1040 };
    const SECOND: Rect = Rect { x: 1920, y: 0, width: 1920, height: 1040 };

    fn rect(x: i64, y: i64, width: i64, height: i64) -> Rect {
        Rect { x, y, width, height }
    }

    #[test]
    fn normal_size_uses_the_prd_default_min_and_max() {
        assert_eq!(size_for(false), (352, 353));
        assert_eq!(limits(false), ((262, 233), (578, 574)));
    }

    #[test]
    fn compact_bar_has_equal_min_and_max_so_it_cannot_resize() {
        assert_eq!(size_for(true), (320, 110));
        assert_eq!(limits(true), ((320, 110), (320, 110)));
    }

    #[test]
    fn saved_size_is_clamped_to_the_square_limits() {
        assert_eq!(clamp_size(1000, 50), (578, 233));
        assert_eq!(clamp_size(100, 9000), (262, 574));
    }

    #[test]
    fn missing_or_zero_size_falls_back_to_the_default() {
        let stored = parse(Some(&json!({ "x": 10, "y": 20, "w": 0, "h": "wide" })));
        assert_eq!(stored.rect, Some(rect(10, 20, 352, 353)));
        assert!(!stored.compact);
    }

    #[test]
    fn stored_position_and_compact_flag_are_read() {
        let stored = parse(Some(&json!({ "x": 40.4, "y": 60, "w": 400, "h": 400, "compact": true })));
        assert_eq!(stored, Stored { rect: Some(rect(40, 60, 400, 400)), compact: true });
    }

    #[test]
    fn no_saved_position_means_no_rect() {
        assert_eq!(parse(None), Stored { rect: None, compact: false });
        assert_eq!(parse(Some(&json!({ "w": 300 }))).rect, None);
    }

    #[test]
    fn default_rect_sits_bottom_right_with_a_16_px_margin() {
        assert_eq!(default_rect(SCREEN, 352, 353), rect(1552, 671, 352, 353));
    }

    #[test]
    fn a_rect_that_is_off_every_screen_goes_to_the_default_spot() {
        let stored = Stored { rect: Some(rect(5000, 100, 400, 400)), compact: false };
        assert_eq!(plan(stored, &[SCREEN], SCREEN), rect(1504, 624, 400, 400));
    }

    #[test]
    fn a_partly_off_screen_rect_is_pulled_inside_its_screen() {
        let stored = Stored { rect: Some(rect(1800, 900, 352, 353)), compact: false };
        assert_eq!(plan(stored, &[SCREEN], SCREEN), rect(1568, 687, 352, 353));
    }

    #[test]
    fn a_rect_on_a_second_screen_stays_on_that_screen() {
        let stored = Stored { rect: Some(rect(2300, 200, 352, 353)), compact: false };
        assert_eq!(plan(stored, &[SCREEN, SECOND], SCREEN), rect(2300, 200, 352, 353));
    }

    #[test]
    fn no_known_screen_uses_the_default_spot() {
        let stored = Stored { rect: Some(rect(100, 100, 352, 353)), compact: false };
        assert_eq!(plan(stored, &[], SCREEN), rect(1552, 671, 352, 353));
    }

    #[test]
    fn bar_box_keeps_the_bottom_right_corner_of_the_square() {
        let square = rect(100, 200, 352, 353);
        assert_eq!(bar_box(square), rect(132, 443, 320, 110));
    }

    #[test]
    fn restoring_the_square_from_the_bar_round_trips() {
        let square = rect(100, 200, 400, 420);
        assert_eq!(square_at(bar_box(square), 400, 420), square);
    }

    #[test]
    fn stored_json_reads_back_to_the_same_rect_and_flag() {
        let saved = Saved { rect: rect(7, 8, 352, 353), compact: true };
        let stored = parse(Some(&stored_json(saved)));
        assert_eq!(stored, Stored { rect: Some(saved.rect), compact: true });
    }

    #[test]
    fn navigation_is_limited_to_the_app_origin() {
        let allowed = |text: &str| navigation_allowed(&Url::parse(text).expect("url"));
        assert!(allowed("tauri://localhost/index.html"));
        assert!(allowed("http://tauri.localhost/index.html?window=pip"));
        assert!(!allowed("https://www.youtube.com/watch?v=x"));
        assert!(!allowed("https://example.com/"));
    }

    #[test]
    fn always_on_top_is_not_offered_on_gnome_wayland_only() {
        assert!(!always_on_top_supported(true, true, "ubuntu:GNOME"));
        assert!(always_on_top_supported(true, false, "ubuntu:GNOME"));
        assert!(always_on_top_supported(true, true, "KDE"));
        assert!(always_on_top_supported(false, true, "GNOME"));
    }

    #[test]
    fn only_the_listed_windows_may_call_a_command() {
        assert!(sender_allowed(LABEL, &[LABEL]));
        assert!(!sender_allowed(window::MAIN, &[LABEL]));
        assert!(sender_allowed(window::MAIN, &[window::MAIN, LABEL]));
    }

    #[test]
    fn transport_commands_parse_from_the_wire_format() {
        assert_eq!(from_value::<PipCommand>(json!({ "type": "toggle" })).ok(), Some(PipCommand::Toggle));
        assert_eq!(from_value::<PipCommand>(json!({ "type": "prev" })).ok(), Some(PipCommand::Prev));
        assert_eq!(
            from_value::<PipCommand>(json!({ "type": "seek", "sec": 12.5 })).ok(),
            Some(PipCommand::Seek { sec: 12.5 })
        );
        assert_eq!(
            from_value::<PipCommand>(json!({ "type": "open", "to": "artist" })).ok(),
            Some(PipCommand::Open { to: OpenTarget::Artist })
        );
    }

    #[test]
    fn malformed_or_unknown_commands_are_rejected() {
        assert!(from_value::<PipCommand>(json!({ "type": "explode" })).is_err());
        assert!(from_value::<PipCommand>(json!({ "type": "volume" })).is_err());
        assert!(from_value::<PipCommand>(json!({ "type": "open", "to": "song" })).is_err());
        assert!(from_value::<PipCommand>(json!({ "sec": 3 })).is_err());
    }
}

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Wry};

use crate::window;
use crate::APP_NAME;

pub const MENU_COMMAND: &str = "menu:command";

#[derive(Default)]
pub struct Tray {
    icon: OnceLock<TrayIcon>,
    playing: AtomicBool,
    quitting: AtomicBool,
}

impl Tray {
    pub fn shown(&self) -> bool {
        self.icon.get().is_some()
    }

    pub fn quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    pub fn playing(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Item {
    Open,
    PlayPause,
    Next,
    Previous,
    Quit,
}

impl Item {
    pub fn id(self) -> &'static str {
        match self {
            Item::Open => "open",
            Item::PlayPause => "play-pause",
            Item::Next => "next",
            Item::Previous => "previous",
            Item::Quit => "quit",
        }
    }

    fn from_id(id: &str) -> Option<Self> {
        [Item::Open, Item::PlayPause, Item::Next, Item::Previous, Item::Quit]
            .into_iter()
            .find(|item| item.id() == id)
    }

    pub fn command(self) -> Option<&'static str> {
        match self {
            Item::PlayPause => Some("play-pause"),
            Item::Next => Some("next"),
            Item::Previous => Some("previous"),
            Item::Open | Item::Quit => None,
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Entry {
    Item(Item, String),
    Separator,
}

pub fn menu_spec(app_name: &str, playing: bool) -> Vec<Entry> {
    let play_pause = if playing { "Pause" } else { "Play" };
    vec![
        Entry::Item(Item::Open, format!("Open {app_name}")),
        Entry::Separator,
        Entry::Item(Item::PlayPause, play_pause.to_owned()),
        Entry::Item(Item::Next, "Next".to_owned()),
        Entry::Item(Item::Previous, "Previous".to_owned()),
        Entry::Separator,
        Entry::Item(Item::Quit, format!("Quit {app_name}")),
    ]
}

pub fn setup(app: &AppHandle) {
    if !cfg!(any(target_os = "windows", target_os = "linux")) {
        return;
    }
    if !watcher_available() {
        tracing::warn!("tray unavailable: no StatusNotifierWatcher");
        return;
    }
    match create(app) {
        Ok(icon) => {
            let _ = app.state::<Tray>().icon.set(icon);
        }
        Err(error) => tracing::warn!("tray icon unavailable: {error}"),
    }
}

pub fn send_command(app: &AppHandle, command: &str) {
    let _ = app.emit(MENU_COMMAND, command);
}

pub fn quit(app: &AppHandle) {
    app.state::<Tray>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn watcher_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        watcher_on_session_bus()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}

#[cfg(target_os = "linux")]
fn watcher_on_session_bus() -> bool {
    let Ok(name) = zbus::names::BusName::try_from("org.kde.StatusNotifierWatcher") else {
        return false;
    };
    zbus::blocking::Connection::session()
        .and_then(|connection| zbus::blocking::fdo::DBusProxy::new(&connection))
        .and_then(|proxy| proxy.name_has_owner(name))
        .unwrap_or(false)
}

fn create(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let Some(icon) = app.default_window_icon().cloned() else {
        return Err(tauri::Error::AssetNotFound("default window icon".into()));
    };
    let playing = app.state::<Tray>().playing.load(Ordering::SeqCst);
    let menu = build_menu(app, playing)?;
    TrayIconBuilder::new()
        .icon(icon)
        .tooltip(APP_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| on_icon(tray.app_handle(), event))
        .build(app)
}

fn build_menu(app: &AppHandle, playing: bool) -> tauri::Result<Menu<Wry>> {
    let mut entries: Vec<Box<dyn IsMenuItem<Wry>>> = Vec::new();
    for entry in menu_spec(APP_NAME, playing) {
        match entry {
            Entry::Item(item, label) => {
                entries.push(Box::new(MenuItem::with_id(app, item.id(), label, true, None::<&str>)?))
            }
            Entry::Separator => entries.push(Box::new(PredefinedMenuItem::separator(app)?)),
        }
    }
    let refs: Vec<&dyn IsMenuItem<Wry>> = entries.iter().map(|entry| entry.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn on_icon(app: &AppHandle, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        }
        | TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => window::show_main(app),
        _ => {}
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    let Some(item) = Item::from_id(id) else {
        return;
    };
    match item {
        Item::Open => window::show_main(app),
        Item::Quit => quit(app),
        other => {
            if let Some(command) = other.command() {
                send_command(app, command);
            }
        }
    }
}

#[tauri::command]
pub fn tray_set_playing(app: AppHandle, tray: State<'_, Tray>, playing: bool) -> Result<(), String> {
    let previous = tray.playing.swap(playing, Ordering::SeqCst);
    if previous == playing {
        return Ok(());
    }
    crate::taskbar::set_playing(&app, playing);
    if let Some(icon) = tray.icon.get() {
        let menu = build_menu(&app, playing).map_err(|error| error.to_string())?;
        icon.set_menu(Some(menu)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_follows_the_prd_order_and_labels_while_paused() {
        assert_eq!(
            menu_spec("Hushio", false),
            vec![
                Entry::Item(Item::Open, "Open Hushio".to_owned()),
                Entry::Separator,
                Entry::Item(Item::PlayPause, "Play".to_owned()),
                Entry::Item(Item::Next, "Next".to_owned()),
                Entry::Item(Item::Previous, "Previous".to_owned()),
                Entry::Separator,
                Entry::Item(Item::Quit, "Quit Hushio".to_owned()),
            ]
        );
    }

    #[test]
    fn the_play_pause_item_reads_pause_while_playing() {
        let spec = menu_spec("Hushio", true);
        assert_eq!(spec[2], Entry::Item(Item::PlayPause, "Pause".to_owned()));
        assert_eq!(spec.len(), 7);
    }

    #[test]
    fn every_menu_id_maps_back_to_its_item() {
        for item in [Item::Open, Item::PlayPause, Item::Next, Item::Previous, Item::Quit] {
            assert_eq!(Item::from_id(item.id()), Some(item));
        }
        assert_eq!(Item::from_id("unknown"), None);
    }

    #[test]
    fn transport_items_send_their_menu_commands() {
        assert_eq!(Item::PlayPause.command(), Some("play-pause"));
        assert_eq!(Item::Next.command(), Some("next"));
        assert_eq!(Item::Previous.command(), Some("previous"));
        assert_eq!(Item::Open.command(), None);
        assert_eq!(Item::Quit.command(), None);
    }
}

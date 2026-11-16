#![cfg_attr(not(target_os = "macos"), allow(dead_code, unused_imports))]

use serde::Deserialize;

#[cfg(target_os = "macos")]
use tauri::menu::{
    AboutMetadata, CheckMenuItem, CheckMenuItemBuilder, IsMenuItem, MenuBuilder, MenuItem,
    MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Emitter, Manager, Wry};

pub const EVENT: &str = "menu:command";

const MAIN_WINDOW: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Native {
    ShowMain,
    Reload,
    DevTools,
    Delete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Predefined {
    About,
    Services,
    Hide,
    HideOthers,
    ShowAll,
    Quit,
    CloseWindow,
    Minimize,
    Zoom,
    Fullscreen,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Node {
    Command {
        command: &'static str,
        label: String,
        accelerator: Option<&'static str>,
    },
    Check {
        command: &'static str,
        label: String,
    },
    Native {
        id: &'static str,
        label: String,
        action: Native,
    },
    Predefined {
        kind: Predefined,
        label: String,
    },
    Separator,
    Menu {
        label: String,
        items: Vec<Node>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Command(&'static str),
    Native(Native),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Repeat {
    Off,
    All,
    One,
}

impl Repeat {
    pub fn command(self) -> &'static str {
        match self {
            Repeat::Off => "repeat-off",
            Repeat::All => "repeat-all",
            Repeat::One => "repeat-one",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub playing: bool,
    pub shuffle: bool,
    pub repeat: Repeat,
}

fn command(command: &'static str, label: &str, accelerator: Option<&'static str>) -> Node {
    Node::Command {
        command,
        label: label.to_owned(),
        accelerator,
    }
}

fn check(command: &'static str, label: &str) -> Node {
    Node::Check {
        command,
        label: label.to_owned(),
    }
}

fn native(id: &'static str, label: &str, action: Native) -> Node {
    Node::Native {
        id,
        label: label.to_owned(),
        action,
    }
}

fn predefined(kind: Predefined, label: &str) -> Node {
    Node::Predefined {
        kind,
        label: label.to_owned(),
    }
}

fn menu(label: &str, items: Vec<Node>) -> Node {
    Node::Menu {
        label: label.to_owned(),
        items,
    }
}

pub fn menus(dev: bool) -> Vec<Node> {
    let app = crate::APP_NAME;
    let mut view = vec![predefined(Predefined::Fullscreen, "Enter Full Screen")];
    if dev {
        view.extend([
            Node::Separator,
            native("reload", "Reload", Native::Reload),
            native("force-reload", "Force Reload", Native::Reload),
            native("devtools", "Toggle Developer Tools", Native::DevTools),
        ]);
    }

    vec![
        menu(
            app,
            vec![
                predefined(Predefined::About, &format!("About {app}")),
                command("updates", "Check for Updates", None),
                Node::Separator,
                command("settings", "Settings\u{2026}", Some("Cmd+,")),
                Node::Separator,
                predefined(Predefined::Services, "Services"),
                Node::Separator,
                predefined(Predefined::Hide, &format!("Hide {app}")),
                predefined(Predefined::HideOthers, "Hide Others"),
                predefined(Predefined::ShowAll, "Show All"),
                Node::Separator,
                predefined(Predefined::Quit, &format!("Quit {app}")),
            ],
        ),
        menu(
            "File",
            vec![
                command("import-backup", "Import Backup\u{2026}", Some("Cmd+O")),
                command("export-backup", "Export Backup\u{2026}", Some("Cmd+S")),
                Node::Separator,
                predefined(Predefined::CloseWindow, "Close"),
            ],
        ),
        menu(
            "Edit",
            vec![
                predefined(Predefined::Undo, "Undo"),
                predefined(Predefined::Redo, "Redo"),
                Node::Separator,
                predefined(Predefined::Cut, "Cut"),
                predefined(Predefined::Copy, "Copy"),
                predefined(Predefined::Paste, "Paste"),
                native("delete", "Delete", Native::Delete),
                predefined(Predefined::SelectAll, "Select All"),
                Node::Separator,
                command("focus-search", "Find", Some("Cmd+F")),
            ],
        ),
        menu("View", view),
        menu(
            "Playback",
            vec![
                command("play-pause", "Play", None),
                command("next", "Next", None),
                command("previous", "Previous", None),
                Node::Separator,
                check("shuffle", "Shuffle"),
                menu(
                    "Repeat",
                    vec![
                        check("repeat-off", "Repeat Off"),
                        check("repeat-all", "Repeat All"),
                        check("repeat-one", "Repeat One"),
                    ],
                ),
                menu(
                    "Sleep Timer",
                    vec![
                        command("sleep-15", "15 Minutes", None),
                        command("sleep-30", "30 Minutes", None),
                        command("sleep-60", "1 Hour", None),
                        command("sleep-end", "End of This Song", None),
                        Node::Separator,
                        command("sleep-off", "Turn Off", None),
                    ],
                ),
                Node::Separator,
                command("queue", "Show Queue", None),
                command("lyrics", "Show Lyrics", None),
                command("now-playing", "Now Playing View", Some("Ctrl+Cmd+F")),
            ],
        ),
        menu(
            "Window",
            vec![
                predefined(Predefined::Minimize, "Minimize"),
                predefined(Predefined::Zoom, "Zoom"),
                Node::Separator,
                native("main-window", "Main Window", Native::ShowMain),
                command("miniplayer", &format!("{app} Miniplayer"), None),
                Node::Separator,
                native("bring-all-to-front", "Bring All to Front", Native::ShowMain),
            ],
        ),
    ]
}

fn leaves(nodes: &[Node]) -> Vec<&Node> {
    let mut out = Vec::new();
    for node in nodes {
        match node {
            Node::Menu { items, .. } => out.extend(leaves(items)),
            Node::Separator => {}
            other => out.push(other),
        }
    }
    out
}

#[cfg(any(test, not(target_os = "macos")))]
pub fn ids(nodes: &[Node]) -> Vec<&'static str> {
    leaves(nodes)
        .into_iter()
        .filter_map(|node| match node {
            Node::Command { command, .. } | Node::Check { command, .. } => Some(*command),
            Node::Native { id, .. } => Some(*id),
            _ => None,
        })
        .collect()
}

#[cfg(any(test, not(target_os = "macos")))]
pub fn commands(nodes: &[Node]) -> Vec<&'static str> {
    leaves(nodes)
        .into_iter()
        .filter_map(|node| match node {
            Node::Command { command, .. } | Node::Check { command, .. } => Some(*command),
            _ => None,
        })
        .collect()
}

#[cfg(any(test, not(target_os = "macos")))]
pub fn accelerators(nodes: &[Node]) -> Vec<&'static str> {
    leaves(nodes)
        .into_iter()
        .filter_map(|node| match node {
            Node::Command { accelerator, .. } => *accelerator,
            _ => None,
        })
        .collect()
}

pub fn route(nodes: &[Node], id: &str) -> Option<Route> {
    leaves(nodes).into_iter().find_map(|node| match *node {
        Node::Command { command, .. } | Node::Check { command, .. } if command == id => {
            Some(Route::Command(command))
        }
        Node::Native { id: native_id, action, .. } if native_id == id => {
            Some(Route::Native(action))
        }
        _ => None,
    })
}

pub fn play_label(playing: bool) -> &'static str {
    if playing { "Pause" } else { "Play" }
}

pub fn repeat_radio(clicked: &str) -> Option<[(&'static str, bool); 3]> {
    let modes = [Repeat::Off, Repeat::All, Repeat::One];
    if !modes.iter().any(|mode| mode.command() == clicked) {
        return None;
    }
    Some(modes.map(|mode| (mode.command(), mode.command() == clicked)))
}

pub fn checked_for(id: &str, state: &PlaybackState) -> bool {
    if id == "shuffle" {
        state.shuffle
    } else {
        id == state.repeat.command()
    }
}

#[tauri::command]
pub fn menu_set_playback_state(app: tauri::AppHandle, state: PlaybackState) -> Result<(), String> {
    apply_playback(&app, state).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
pub struct Items {
    play: Option<MenuItem<Wry>>,
    checks: Vec<(&'static str, CheckMenuItem<Wry>)>,
}

#[cfg(target_os = "macos")]
fn apply_playback(app: &AppHandle, state: PlaybackState) -> tauri::Result<()> {
    let Some(items) = app.try_state::<Items>() else {
        return Ok(());
    };
    if let Some(play) = &items.play {
        play.set_text(play_label(state.playing))?;
    }
    for (id, check) in &items.checks {
        check.set_checked(checked_for(id, &state))?;
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn apply_playback(_app: &tauri::AppHandle, _state: PlaybackState) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn build(
    app: &AppHandle,
    node: &Node,
    items: &mut Items,
) -> tauri::Result<Box<dyn IsMenuItem<Wry>>> {
    let built: Box<dyn IsMenuItem<Wry>> = match node {
        Node::Command {
            command,
            label,
            accelerator,
        } => {
            let mut builder = MenuItemBuilder::with_id(*command, label);
            if let Some(accelerator) = accelerator {
                builder = builder.accelerator(accelerator);
            }
            let item = builder.build(app)?;
            if *command == "play-pause" {
                items.play = Some(item.clone());
            }
            Box::new(item)
        }
        Node::Check { command, label } => {
            let item = CheckMenuItemBuilder::with_id(*command, label)
                .checked(false)
                .build(app)?;
            items.checks.push((*command, item.clone()));
            Box::new(item)
        }
        Node::Native { id, label, .. } => Box::new(MenuItemBuilder::with_id(*id, label).build(app)?),
        Node::Predefined { kind, label } => {
            let text = Some(label.as_str());
            match kind {
                Predefined::About => Box::new(PredefinedMenuItem::about(
                    app,
                    text,
                    Some(AboutMetadata {
                        name: Some(crate::APP_NAME.to_owned()),
                        version: Some(env!("CARGO_PKG_VERSION").to_owned()),
                        ..Default::default()
                    }),
                )?),
                Predefined::Services => Box::new(PredefinedMenuItem::services(app, text)?),
                Predefined::Hide => Box::new(PredefinedMenuItem::hide(app, text)?),
                Predefined::HideOthers => Box::new(PredefinedMenuItem::hide_others(app, text)?),
                Predefined::ShowAll => Box::new(PredefinedMenuItem::show_all(app, text)?),
                Predefined::Quit => Box::new(PredefinedMenuItem::quit(app, text)?),
                Predefined::CloseWindow => Box::new(PredefinedMenuItem::close_window(app, text)?),
                Predefined::Minimize => Box::new(PredefinedMenuItem::minimize(app, text)?),
                Predefined::Zoom => Box::new(PredefinedMenuItem::maximize(app, text)?),
                Predefined::Fullscreen => Box::new(PredefinedMenuItem::fullscreen(app, text)?),
                Predefined::Undo => Box::new(PredefinedMenuItem::undo(app, text)?),
                Predefined::Redo => Box::new(PredefinedMenuItem::redo(app, text)?),
                Predefined::Cut => Box::new(PredefinedMenuItem::cut(app, text)?),
                Predefined::Copy => Box::new(PredefinedMenuItem::copy(app, text)?),
                Predefined::Paste => Box::new(PredefinedMenuItem::paste(app, text)?),
                Predefined::SelectAll => Box::new(PredefinedMenuItem::select_all(app, text)?),
            }
        }
        Node::Separator => Box::new(PredefinedMenuItem::separator(app)?),
        Node::Menu { label, items: children } => {
            let built_children = children
                .iter()
                .map(|child| build(app, child, items))
                .collect::<tauri::Result<Vec<_>>>()?;
            let mut builder = SubmenuBuilder::new(app, label);
            for child in &built_children {
                builder = builder.item(child.as_ref());
            }
            Box::new(builder.build()?)
        }
    };
    Ok(built)
}

#[cfg(target_os = "macos")]
fn apply_radio(app: &AppHandle, radio: [(&'static str, bool); 3]) {
    let Some(items) = app.try_state::<Items>() else {
        return;
    };
    for (id, checked) in radio {
        for (check_id, check) in &items.checks {
            if *check_id == id {
                if let Err(error) = check.set_checked(checked) {
                    tracing::warn!(%error, id, "could not update repeat checkmark");
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW)
}

#[cfg(target_os = "macos")]
fn run_native(app: &AppHandle, action: Native) {
    match action {
        Native::ShowMain => crate::macos_window::show_main(app),
        Native::Delete => {
            if let Some(window) = main_window(app) {
                if let Err(error) = window.eval("document.execCommand('delete')") {
                    tracing::warn!(%error, "could not delete selection");
                }
            }
        }
        Native::Reload => {
            if let Some(window) = main_window(app) {
                if let Err(error) = window.reload() {
                    tracing::warn!(%error, "could not reload window");
                }
            }
        }
        Native::DevTools => open_devtools(app),
    }
}

#[cfg(all(target_os = "macos", debug_assertions))]
fn open_devtools(app: &AppHandle) {
    if let Some(window) = main_window(app) {
        window.open_devtools();
    }
}

#[cfg(all(target_os = "macos", not(debug_assertions)))]
fn open_devtools(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
fn on_menu(app: &AppHandle, id: &str) {
    let nodes = menus(cfg!(debug_assertions));
    match route(&nodes, id) {
        Some(Route::Command(command)) => {
            if let Some(radio) = repeat_radio(command) {
                apply_radio(app, radio);
            }
            if let Err(error) = app.emit(EVENT, command) {
                tracing::warn!(%error, command, "could not send menu command");
            }
        }
        Some(Route::Native(action)) => run_native(app, action),
        None => {}
    }
}

#[cfg(target_os = "macos")]
pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let nodes = menus(cfg!(debug_assertions));
    let mut items = Items {
        play: None,
        checks: Vec::new(),
    };
    let mut builder = MenuBuilder::new(app);
    for node in &nodes {
        let top = build(app, node, &mut items)?;
        builder = builder.item(top.as_ref());
    }
    let menu = builder.build()?;
    app.set_menu(menu)?;
    app.manage(items);
    app.on_menu_event(|app, event| on_menu(app, event.id().as_ref()));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    const SHORTCUTS: [&str; 5] = ["Cmd+,", "Cmd+O", "Cmd+S", "Cmd+F", "Ctrl+Cmd+F"];

    #[test]
    fn ids_are_unique_in_both_builds() {
        for dev in [false, true] {
            let ids = ids(&menus(dev));
            let unique: HashSet<_> = ids.iter().collect();
            assert_eq!(unique.len(), ids.len(), "duplicate id in dev={dev}");
        }
    }

    #[test]
    fn menu_commands_are_the_prd_command_names() {
        const PRD_COMMANDS: [&str; 21] = [
            "play-pause", "next", "previous", "shuffle", "repeat-off", "repeat-all", "repeat-one",
            "sleep-15", "sleep-30", "sleep-60", "sleep-end", "sleep-off", "queue", "lyrics",
            "now-playing", "miniplayer", "settings", "updates", "focus-search", "import-backup",
            "export-backup",
        ];
        let mut found = commands(&menus(true));
        found.sort_unstable();
        let mut expected = PRD_COMMANDS.to_vec();
        expected.sort_unstable();
        assert_eq!(found, expected);
    }

    #[test]
    fn every_id_routes_to_a_command_or_native_action() {
        let nodes = menus(true);
        for id in ids(&nodes) {
            assert!(route(&nodes, id).is_some(), "{id} does not route");
        }
        assert_eq!(route(&nodes, "queue"), Some(Route::Command("queue")));
        assert_eq!(route(&nodes, "delete"), Some(Route::Native(Native::Delete)));
        assert_eq!(route(&nodes, "missing"), None);
    }

    #[test]
    fn accelerators_match_the_prd_and_do_not_repeat() {
        let nodes = menus(false);
        let mut found = accelerators(&nodes);
        found.sort_unstable();
        let mut expected = SHORTCUTS.to_vec();
        expected.sort_unstable();
        assert_eq!(found, expected);
        let unique: HashSet<_> = found.iter().collect();
        assert_eq!(unique.len(), found.len());
    }

    #[test]
    fn development_items_appear_only_in_debug_builds() {
        assert!(!ids(&menus(false)).contains(&"devtools"));
        assert!(ids(&menus(true)).contains(&"devtools"));
        let mut dev = accelerators(&menus(true));
        dev.sort_unstable();
        let mut expected = SHORTCUTS.to_vec();
        expected.sort_unstable();
        assert_eq!(dev, expected);
    }

    #[test]
    fn app_menu_has_about_and_settings_ellipsis() {
        let nodes = menus(false);
        let Node::Menu { label, items } = &nodes[0] else {
            panic!("first menu is not the app menu");
        };
        assert_eq!(label, "Hushio");
        assert!(items.contains(&Node::Predefined {
            kind: Predefined::About,
            label: "About Hushio".into(),
        }));
        assert!(items.contains(&Node::Command {
            command: "settings",
            label: "Settings\u{2026}".into(),
            accelerator: Some("Cmd+,"),
        }));
    }

    #[test]
    fn menu_titles_follow_the_prd_order() {
        let nodes = menus(false);
        let titles: Vec<&str> = nodes
            .iter()
            .map(|node| match node {
                Node::Menu { label, .. } => label.as_str(),
                _ => "",
            })
            .collect();
        assert_eq!(titles, ["Hushio", "File", "Edit", "View", "Playback", "Window"]);
    }

    #[test]
    fn play_label_follows_state() {
        assert_eq!(play_label(true), "Pause");
        assert_eq!(play_label(false), "Play");
    }

    #[test]
    fn repeat_is_radio_and_reselecting_keeps_one_checked() {
        assert_eq!(
            repeat_radio("repeat-all"),
            Some([("repeat-off", false), ("repeat-all", true), ("repeat-one", false)])
        );
        assert_eq!(
            repeat_radio("repeat-off"),
            Some([("repeat-off", true), ("repeat-all", false), ("repeat-one", false)])
        );
        assert_eq!(repeat_radio("queue"), None);
    }

    #[test]
    fn checkmarks_follow_playback_state() {
        let state = PlaybackState {
            playing: true,
            shuffle: true,
            repeat: Repeat::One,
        };
        assert!(checked_for("shuffle", &state));
        assert!(checked_for("repeat-one", &state));
        assert!(!checked_for("repeat-all", &state));
        assert!(!checked_for("repeat-off", &state));
    }

    #[test]
    fn playback_state_parses_from_the_frontend_shape() {
        let state: PlaybackState =
            serde_json::from_str(r#"{"playing":false,"shuffle":false,"repeat":"all"}"#).unwrap();
        assert_eq!(state.repeat, Repeat::All);
        assert!(!state.playing);
    }

    fn child_labels(nodes: &[Node], title: &str) -> Vec<String> {
        let Some(Node::Menu { items, .. }) = nodes
            .iter()
            .find(|node| matches!(node, Node::Menu { label, .. } if label == title))
        else {
            panic!("no {title} menu");
        };
        items
            .iter()
            .filter_map(|node| match node {
                Node::Command { label, .. }
                | Node::Check { label, .. }
                | Node::Native { label, .. }
                | Node::Predefined { label, .. }
                | Node::Menu { label, .. } => Some(label.clone()),
                Node::Separator => None,
            })
            .collect()
    }

    #[test]
    fn file_and_playback_menus_follow_the_prd_order() {
        let nodes = menus(false);
        assert_eq!(
            child_labels(&nodes, "File"),
            ["Import Backup\u{2026}", "Export Backup\u{2026}", "Close"]
        );
        assert_eq!(
            child_labels(&nodes, "Playback"),
            [
                "Play",
                "Next",
                "Previous",
                "Shuffle",
                "Repeat",
                "Sleep Timer",
                "Show Queue",
                "Show Lyrics",
                "Now Playing View",
            ]
        );
    }

    #[test]
    fn window_menu_ends_with_miniplayer_and_bring_to_front() {
        let labels = child_labels(&menus(false), "Window");
        assert_eq!(labels[..2], ["Minimize", "Zoom"]);
        assert_eq!(labels[3..], ["Hushio Miniplayer", "Bring All to Front"]);
    }

    #[test]
    fn transport_items_have_no_accelerator_so_typing_is_never_taken() {
        let nodes = menus(false);
        for id in ["play-pause", "next", "previous"] {
            let Some(Node::Command { accelerator, .. }) = leaves(&nodes)
                .into_iter()
                .find(|node| matches!(node, Node::Command { command, .. } if *command == id))
            else {
                panic!("{id} is not a command item");
            };
            assert_eq!(*accelerator, None, "{id} has an accelerator");
        }
    }

    #[test]
    fn repeat_and_sleep_submenus_hold_their_radio_and_timer_items() {
        let nodes = menus(false);
        let Node::Menu { items: playback, .. } = nodes
            .iter()
            .find(|node| matches!(node, Node::Menu { label, .. } if label == "Playback"))
            .expect("Playback menu")
        else {
            unreachable!();
        };
        let repeat = playback
            .iter()
            .find_map(|node| match node {
                Node::Menu { label, items } if label == "Repeat" => Some(items),
                _ => None,
            })
            .expect("Repeat submenu");
        assert!(repeat.iter().all(|node| matches!(node, Node::Check { .. })));
        let sleep = playback
            .iter()
            .find_map(|node| match node {
                Node::Menu { label, items } if label == "Sleep Timer" => Some(items),
                _ => None,
            })
            .expect("Sleep Timer submenu");
        assert_eq!(
            ids(&[Node::Menu { label: "Sleep".into(), items: sleep.clone() }]),
            ["sleep-15", "sleep-30", "sleep-60", "sleep-end", "sleep-off"]
        );
    }
}

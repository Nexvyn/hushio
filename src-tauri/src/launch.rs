use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

use crate::local_library::{is_playable_name, unplayable_format};

pub const SCHEME: &str = "hushio";
pub const PENDING_EVENT: &str = "launch:pending";
const PLAYLIST_HOST: &str = "playlist";
const MAX_LIST_ID_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    File { path: String },
    Playlist { id: String },
}

#[derive(Default)]
pub struct Pending(Mutex<Vec<Action>>);

pub fn parse_argv(argv: &[String], cwd: &Path) -> Vec<Action> {
    argv.iter().skip(1).filter_map(|arg| parse_arg(arg, cwd)).collect()
}

fn parse_arg(arg: &str, cwd: &Path) -> Option<Action> {
    if arg.starts_with('-') {
        return None;
    }
    if let Ok(url) = Url::parse(arg) {
        if url.scheme().len() > 1 {
            return match url.scheme() {
                SCHEME => parse_link(&url),
                "file" => audio_file(&url.to_file_path().ok()?, cwd),
                _ => None,
            };
        }
    }
    audio_file(Path::new(arg), cwd)
}

fn parse_link(url: &Url) -> Option<Action> {
    if url.host_str() != Some(PLAYLIST_HOST) {
        return None;
    }
    let (_, id) = url.query_pairs().find(|(key, _)| key == "list")?;
    let valid = !id.is_empty()
        && id.chars().count() <= MAX_LIST_ID_CHARS
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    valid.then(|| Action::Playlist { id: id.into_owned() })
}

fn audio_file(path: &Path, cwd: &Path) -> Option<Action> {
    let name = path.file_name()?.to_str()?;
    if !(is_playable_name(name) || unplayable_format(name).is_some()) {
        return None;
    }
    let absolute: PathBuf = if path.is_absolute() { path.to_path_buf() } else { cwd.join(path) };
    Some(Action::File { path: absolute.to_string_lossy().into_owned() })
}

pub fn receive(app: &AppHandle, argv: &[String], cwd: &Path) {
    let actions = parse_argv(argv, cwd);
    if actions.is_empty() {
        return;
    }
    app.state::<Pending>()
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .extend(actions);
    let _ = app.emit(PENDING_EVENT, ());
}

pub fn register_scheme(app: &AppHandle) {
    if !cfg!(debug_assertions) || std::env::var_os(crate::DATA_DIR_ENV).is_some() {
        return;
    }
    if let Err(error) = app.deep_link().register(SCHEME) {
        tracing::warn!(%error, "could not register the hushio scheme");
    }
}

#[tauri::command]
pub fn launch_take(pending: State<'_, Pending>) -> Vec<Action> {
    std::mem::take(&mut *pending.0.lock().unwrap_or_else(PoisonError::into_inner))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(args: &[&str]) -> Vec<String> {
        args.iter().map(|arg| arg.to_string()).collect()
    }

    fn one(arg: &str) -> Vec<Action> {
        parse_argv(&argv(&["hushio-desktop", arg]), &std::env::temp_dir())
    }

    fn file(name: &str) -> Action {
        Action::File { path: std::env::temp_dir().join(name).to_string_lossy().into_owned() }
    }

    #[test]
    fn a_valid_playlist_link_becomes_a_playlist_action() {
        assert_eq!(
            one("hushio://playlist?list=PL123_abc-9"),
            vec![Action::Playlist { id: "PL123_abc-9".into() }]
        );
    }

    #[test]
    fn malformed_playlist_links_are_ignored() {
        assert!(one("hushio://playlist?list=").is_empty());
        assert!(one("hushio://playlist").is_empty());
        assert!(one("hushio://playlist?list=a/b").is_empty());
        assert!(one("hushio://playlist?list=a%20b").is_empty());
        assert!(one(&format!("hushio://playlist?list={}", "a".repeat(65))).is_empty());
    }

    #[test]
    fn other_hosts_and_other_schemes_are_ignored() {
        assert!(one("hushio://rooms/abc").is_empty());
        assert!(one("hushio://").is_empty());
        assert!(one("https://music.youtube.com/playlist?list=PL123").is_empty());
        assert!(one("javascript:alert(1)").is_empty());
    }

    #[test]
    fn known_audio_paths_are_kept_and_other_files_are_dropped() {
        let dir = std::env::temp_dir();
        assert_eq!(one(&dir.join("a.mp3").to_string_lossy()), vec![file("a.mp3")]);
        assert_eq!(one(&dir.join("B.FLAC").to_string_lossy()), vec![file("B.FLAC")]);
        assert_eq!(one(&dir.join("old.wma").to_string_lossy()), vec![file("old.wma")]);
        assert!(one(&dir.join("cover.png").to_string_lossy()).is_empty());
        assert!(one(&dir.to_string_lossy()).is_empty());
    }

    #[test]
    fn flags_and_the_executable_path_are_never_files() {
        assert!(one("--allow-multi.mp3").is_empty());
        assert!(parse_argv(&argv(&["player.mp3"]), &std::env::temp_dir()).is_empty());
    }

    #[test]
    fn relative_audio_paths_resolve_against_the_second_launch_folder() {
        assert_eq!(
            parse_argv(&argv(&["exe", "song.opus"]), &std::env::temp_dir()),
            vec![file("song.opus")]
        );
    }

    #[test]
    fn file_urls_are_decoded_to_paths() {
        let url = Url::from_file_path(std::env::temp_dir().join("a.m4a")).expect("file url");
        assert_eq!(one(url.as_str()), vec![file("a.m4a")]);
    }

    #[test]
    fn several_arguments_keep_their_order() {
        let actions = parse_argv(
            &argv(&["exe", "a.mp3", "hushio://playlist?list=PL1", "b.wav"]),
            &std::env::temp_dir(),
        );
        assert_eq!(actions, vec![file("a.mp3"), Action::Playlist { id: "PL1".into() }, file("b.wav")]);
    }
}

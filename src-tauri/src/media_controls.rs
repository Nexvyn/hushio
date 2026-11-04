#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::State;

use crate::local_library;

pub const BUTTON_EVENT: &str = "media:button";
pub const SEEK_EVENT: &str = "media:seek";
const TEXT_LIMIT: usize = 500;
const THUMB_LIMIT: usize = 4096;
const ART_PREFIX: &str = "localart://";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Button {
    Play,
    Pause,
    Next,
    Previous,
}

impl Button {
    pub fn action(self) -> &'static str {
        match self {
            Button::Play => "play",
            Button::Pause => "pause",
            Button::Next => "next",
            Button::Previous => "previous",
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaTrack {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub thumb: Option<String>,
    pub duration: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Metadata {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover: Option<String>,
    pub duration: f64,
}

pub fn clip(text: &str) -> String {
    text.chars().take(TEXT_LIMIT).collect()
}

pub fn cover_url(thumb: Option<&str>, art_dir: &Path) -> Option<String> {
    let thumb = thumb?.trim();
    if thumb.is_empty() || thumb.len() > THUMB_LIMIT {
        return None;
    }
    if thumb.starts_with("https://") {
        return Some(thumb.to_owned());
    }
    let name = thumb.strip_prefix(ART_PREFIX)?.trim_start_matches("localhost/");
    if !local_library::is_art_name(name) {
        return None;
    }
    Some(format!("file://{}", art_dir.join(name).display()))
}

fn seconds(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 { value } else { 0.0 }
}

pub fn metadata(track: &MediaTrack, art_dir: &Path) -> Metadata {
    Metadata {
        title: clip(&track.title),
        artist: clip(&track.artist),
        album: clip(&track.album),
        cover: cover_url(track.thumb.as_deref(), art_dir),
        duration: seconds(track.duration),
    }
}

pub fn clamp_position(position: f64, duration: f64) -> Option<f64> {
    if !position.is_finite() || !duration.is_finite() || duration <= 0.0 {
        return None;
    }
    Some(position.clamp(0.0, duration))
}

#[cfg(target_os = "windows")]
pub fn set_app_id() {
    use windows::core::w;
    let result = unsafe {
        windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(w!("com.hushio.app"))
    };
    if let Err(error) = result {
        tracing::warn!(%error, "could not set the app user model id");
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set_app_id() {}

#[cfg(target_os = "windows")]
mod platform {
    use std::path::Path;
    use std::sync::Mutex;
    use std::time::Duration;

    use souvlaki::{
        MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    };
    use tauri::{AppHandle, Emitter, Manager};

    use super::{clamp_position, metadata, Button, MediaTrack, BUTTON_EVENT, SEEK_EVENT};
    use crate::{window, APP_NAME};

    pub struct Session {
        controls: MediaControls,
        app: AppHandle,
        attached: bool,
        playing: bool,
        progress: Option<f64>,
    }

    impl Session {
        fn new(app: &AppHandle) -> Result<Self, String> {
            let window = app
                .get_webview_window(window::MAIN)
                .ok_or_else(|| "main window is missing".to_owned())?;
            let hwnd = window.hwnd().map_err(|error| error.to_string())?;
            let controls = MediaControls::new(PlatformConfig {
                display_name: APP_NAME,
                dbus_name: "hushio",
                hwnd: Some(hwnd.0),
            })
            .map_err(|error| error.to_string())?;
            Ok(Self {
                controls,
                app: app.clone(),
                attached: false,
                playing: false,
                progress: None,
            })
        }

        fn attach(&mut self) -> Result<(), String> {
            let app = self.app.clone();
            self.controls
                .attach(move |event| on_event(&app, event))
                .map_err(|error| error.to_string())?;
            self.attached = true;
            Ok(())
        }

        fn set_track(&mut self, track: &MediaTrack, art_dir: &Path) -> Result<(), String> {
            if !self.attached {
                self.attach()?;
            }
            let meta = metadata(track, art_dir);
            self.controls
                .set_metadata(MediaMetadata {
                    title: Some(&meta.title),
                    artist: Some(&meta.artist),
                    album: Some(&meta.album),
                    cover_url: meta.cover.as_deref(),
                    duration: Some(Duration::from_secs_f64(meta.duration)),
                })
                .map_err(|error| error.to_string())
        }

        fn set_playing(&mut self, playing: bool) -> Result<(), String> {
            self.playing = playing;
            self.apply()
        }

        fn set_position(&mut self, position: f64, duration: f64) -> Result<(), String> {
            match clamp_position(position, duration) {
                Some(at) => {
                    self.progress = Some(at);
                    self.apply()
                }
                None => Ok(()),
            }
        }

        fn clear(&mut self) -> Result<(), String> {
            self.playing = false;
            self.progress = None;
            if self.attached {
                self.controls.detach().map_err(|error| error.to_string())?;
                self.attached = false;
            }
            self.controls
                .set_playback(MediaPlayback::Stopped)
                .map_err(|error| error.to_string())
        }

        fn apply(&mut self) -> Result<(), String> {
            let progress = self.progress.map(|at| MediaPosition(Duration::from_secs_f64(at)));
            let playback = if self.playing {
                MediaPlayback::Playing { progress }
            } else {
                MediaPlayback::Paused { progress }
            };
            self.controls
                .set_playback(playback)
                .map_err(|error| error.to_string())
        }
    }

    fn on_event(app: &AppHandle, event: MediaControlEvent) {
        let button = match event {
            MediaControlEvent::Play => Button::Play,
            MediaControlEvent::Pause => Button::Pause,
            MediaControlEvent::Next => Button::Next,
            MediaControlEvent::Previous => Button::Previous,
            MediaControlEvent::SetPosition(MediaPosition(at)) => {
                let _ = app.emit(SEEK_EVENT, at.as_secs_f64());
                return;
            }
            _ => return,
        };
        let _ = app.emit(BUTTON_EVENT, button.action());
    }

    #[derive(Default)]
    pub struct Controls(Mutex<Option<Session>>);

    impl Controls {
        pub fn install(&self, app: &AppHandle) {
            match Session::new(app) {
                Ok(session) => *self.0.lock().unwrap_or_else(|error| error.into_inner()) = Some(session),
                Err(error) => tracing::warn!(%error, "system media controls unavailable"),
            }
        }

        fn with(&self, act: impl FnOnce(&mut Session) -> Result<(), String>) {
            let mut guard = self.0.lock().unwrap_or_else(|error| error.into_inner());
            let Some(session) = guard.as_mut() else {
                return;
            };
            if let Err(error) = act(session) {
                tracing::warn!(%error, "system media controls update failed");
            }
        }

        pub fn set_track(&self, track: &MediaTrack, art_dir: &Path) {
            self.with(|session| session.set_track(track, art_dir));
        }

        pub fn set_playing(&self, playing: bool) {
            self.with(|session| session.set_playing(playing));
        }

        pub fn set_position(&self, position: f64, duration: f64) {
            self.with(|session| session.set_position(position, duration));
        }

        pub fn clear(&self) {
            self.with(|session| session.clear());
        }
    }
}

#[cfg(target_os = "windows")]
pub use platform::Controls;

#[cfg(not(target_os = "windows"))]
#[derive(Default)]
pub struct Controls;

#[cfg(not(target_os = "windows"))]
impl Controls {
    pub fn install(&self, _app: &tauri::AppHandle) {}

    pub fn set_track(&self, _track: &MediaTrack, _art_dir: &Path) {}

    pub fn set_playing(&self, _playing: bool) {}

    pub fn set_position(&self, _position: f64, _duration: f64) {}

    pub fn clear(&self) {}
}

#[tauri::command]
pub fn media_set_track(
    controls: State<'_, Controls>,
    local: State<'_, local_library::Service>,
    track: MediaTrack,
) {
    let art_dir: PathBuf = local.art_dir();
    controls.set_track(&track, &art_dir);
}

#[tauri::command]
pub fn media_set_playing(controls: State<'_, Controls>, playing: bool) {
    controls.set_playing(playing);
}

#[tauri::command]
pub fn media_set_position(controls: State<'_, Controls>, position: f64, duration: f64) {
    controls.set_position(position, duration);
}

#[tauri::command]
pub fn media_clear(controls: State<'_, Controls>) {
    controls.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    const ART: &str = "0123456789abcdef.jpg";

    fn art_dir() -> PathBuf {
        PathBuf::from("data").join("local-art")
    }

    fn track(thumb: Option<&str>, duration: f64) -> MediaTrack {
        MediaTrack {
            title: "Song".into(),
            artist: "Artist".into(),
            album: "Hushio".into(),
            thumb: thumb.map(str::to_owned),
            duration,
        }
    }

    #[test]
    fn clip_keeps_at_most_five_hundred_characters() {
        let long = "é".repeat(600);
        assert_eq!(clip(&long).chars().count(), 500);
        assert_eq!(clip("Short"), "Short");
    }

    #[test]
    fn https_covers_pass_through() {
        let url = "https://i.ytimg.com/vi/abc/hqdefault.jpg";
        assert_eq!(cover_url(Some(url), &art_dir()), Some(url.to_owned()));
    }

    #[test]
    fn other_schemes_and_missing_covers_are_dropped() {
        let dir = art_dir();
        assert_eq!(cover_url(None, &dir), None);
        assert_eq!(cover_url(Some(""), &dir), None);
        assert_eq!(cover_url(Some("http://example.com/a.jpg"), &dir), None);
        assert_eq!(cover_url(Some("file:///etc/passwd"), &dir), None);
    }

    #[test]
    fn overlong_thumb_is_dropped() {
        let url = format!("https://example.com/{}", "x".repeat(THUMB_LIMIT));
        assert_eq!(cover_url(Some(&url), &art_dir()), None);
    }

    #[test]
    fn local_art_maps_to_a_file_url_in_the_art_folder() {
        let dir = art_dir();
        let expected = format!("file://{}", dir.join(ART).display());
        assert_eq!(cover_url(Some(&format!("localart://{ART}")), &dir), Some(expected.clone()));
        assert_eq!(cover_url(Some(&format!("localart://localhost/{ART}")), &dir), Some(expected));
    }

    #[test]
    fn local_art_outside_the_name_pattern_is_dropped() {
        let dir = art_dir();
        assert_eq!(cover_url(Some("localart://../secret.jpg"), &dir), None);
        assert_eq!(cover_url(Some("localart://0123456789abcdeg.jpg"), &dir), None);
        assert_eq!(cover_url(Some("localart://0123456789abcdef.gif"), &dir), None);
    }

    #[test]
    fn metadata_clips_text_and_zeroes_unknown_duration() {
        let long = "a".repeat(700);
        let mut song = track(None, f64::NAN);
        song.title = long;
        let meta = metadata(&song, &art_dir());
        assert_eq!(meta.title.chars().count(), 500);
        assert_eq!(meta.album, "Hushio");
        assert_eq!(meta.duration, 0.0);
        assert_eq!(metadata(&track(None, 215.5), &art_dir()).duration, 215.5);
    }

    #[test]
    fn position_is_sent_only_with_a_finite_positive_duration() {
        assert_eq!(clamp_position(5.0, 10.0), Some(5.0));
        assert_eq!(clamp_position(-1.0, 10.0), Some(0.0));
        assert_eq!(clamp_position(12.0, 10.0), Some(10.0));
        assert_eq!(clamp_position(5.0, 0.0), None);
        assert_eq!(clamp_position(f64::NAN, 10.0), None);
        assert_eq!(clamp_position(5.0, f64::INFINITY), None);
    }

    #[test]
    fn buttons_map_to_the_frontend_actions() {
        assert_eq!(Button::Play.action(), "play");
        assert_eq!(Button::Pause.action(), "pause");
        assert_eq!(Button::Next.action(), "next");
        assert_eq!(Button::Previous.action(), "previous");
    }
}

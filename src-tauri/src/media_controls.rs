#![allow(dead_code)]

use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::State;

use crate::local_library;
use crate::linux_portal::xdg_dir;

pub const BUTTON_EVENT: &str = "media:button";
pub const SEEK_EVENT: &str = "media:seek";
const TEXT_LIMIT: usize = 500;
const THUMB_LIMIT: usize = 4096;
const ART_PREFIX: &str = "localart://";
const TRACK_PATH_PREFIX: &str = "/com/hushio/track/";
const NO_TRACK_PATH: &str = "/org/mpris/MediaPlayer2/TrackList/NoTrack";
pub const AUDIO_MIME_TYPES: &[&str] = &[
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/flac",
    "audio/x-flac",
    "audio/ogg",
    "audio/opus",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
];

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
    #[serde(default)]
    pub id: String,
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
    cover_with(thumb, art_dir, |path| format!("file://{}", path.display()))
}

pub fn macos_cover_url(thumb: Option<&str>, art_dir: &Path) -> Option<String> {
    cover_with(thumb, art_dir, |path| file_uri(&path.to_string_lossy()))
}

fn cover_with(thumb: Option<&str>, art_dir: &Path, local: impl Fn(&Path) -> String) -> Option<String> {
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
    Some(local(&art_dir.join(name)))
}

fn seconds(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 { value } else { 0.0 }
}

pub fn metadata(track: &MediaTrack, art_dir: &Path) -> Metadata {
    with_cover(track, cover_url(track.thumb.as_deref(), art_dir))
}

pub fn macos_metadata(track: &MediaTrack, art_dir: &Path) -> Metadata {
    with_cover(track, macos_cover_url(track.thumb.as_deref(), art_dir))
}

fn with_cover(track: &MediaTrack, cover: Option<String>) -> Metadata {
    Metadata {
        title: clip(&track.title),
        artist: clip(&track.artist),
        album: clip(&track.album),
        cover,
        duration: seconds(track.duration),
    }
}

pub fn clamp_position(position: f64, duration: f64) -> Option<f64> {
    if !position.is_finite() || !duration.is_finite() || duration <= 0.0 {
        return None;
    }
    Some(position.clamp(0.0, duration))
}

pub fn track_path(id: &str) -> String {
    if id.is_empty() {
        return NO_TRACK_PATH.to_owned();
    }
    let safe: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    format!("{TRACK_PATH_PREFIX}{safe}")
}

pub fn micros(seconds: f64) -> Option<i64> {
    (seconds.is_finite() && seconds > 0.0).then(|| (seconds * 1_000_000.0).round() as i64)
}

pub fn seek_target(position: f64, offset_micros: i64, duration: f64) -> Option<f64> {
    clamp_position(position + offset_micros as f64 / 1_000_000.0, duration)
}

pub fn is_seek_jump(previous: f64, next: f64) -> bool {
    (next - previous).abs() > SEEK_JUMP_S
}

const SEEK_JUMP_S: f64 = 1.0;

pub fn set_position_target(
    current_path: &str,
    requested_path: &str,
    position_micros: i64,
    duration: f64,
) -> Option<f64> {
    if current_path != requested_path {
        return None;
    }
    clamp_position(position_micros as f64 / 1_000_000.0, duration)
}

pub fn play_pause_button(playing: bool) -> Button {
    if playing { Button::Pause } else { Button::Play }
}

#[derive(Debug, Clone, PartialEq)]
pub struct MprisFields {
    pub track_id: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub length_micros: Option<i64>,
    pub art_url: Option<String>,
}

pub fn mpris_fields(track: &MediaTrack, art_url: Option<String>) -> MprisFields {
    let album = clip(&track.album);
    let artist = clip(&track.artist);
    MprisFields {
        track_id: track_path(&track.id),
        title: clip(&track.title),
        artist: (!artist.is_empty()).then_some(artist),
        album: (!album.is_empty()).then_some(album),
        length_micros: micros(track.duration),
        art_url,
    }
}

pub fn file_uri(path: &str) -> String {
    let mut uri = String::from("file://");
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || b"/._-~".contains(&byte) {
            uri.push(byte as char);
        } else {
            uri.push_str(&format!("%{byte:02X}"));
        }
    }
    uri
}

pub fn cover_file_name(source: &str) -> String {
    let digest = Sha256::digest(source.as_bytes());
    let hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("{hex}.jpg")
}

pub fn art_cache_dir(xdg_cache: Option<&str>, home: Option<&str>) -> Option<PathBuf> {
    Some(xdg_dir(xdg_cache, home, ".cache")?.join(crate::APP_SLUG).join("art"))
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

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod platform {
    use std::ffi::c_void;
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use souvlaki::{
        MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    };
    use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

    #[cfg(target_os = "macos")]
    use super::macos_metadata;
    #[cfg(target_os = "windows")]
    use super::metadata;
    use super::{clamp_position, play_pause_button, Button, MediaTrack, Metadata, BUTTON_EVENT, SEEK_EVENT};
    use crate::{window, APP_NAME};

    pub struct Session {
        controls: MediaControls,
        app: AppHandle,
        attached: bool,
        playing: Arc<AtomicBool>,
        progress: Option<f64>,
    }

    #[cfg(target_os = "windows")]
    fn window_handle(window: &WebviewWindow) -> Result<Option<*mut c_void>, String> {
        window.hwnd().map(|hwnd| Some(hwnd.0)).map_err(|error| error.to_string())
    }

    #[cfg(target_os = "macos")]
    fn window_handle(_window: &WebviewWindow) -> Result<Option<*mut c_void>, String> {
        Ok(None)
    }

    #[cfg(target_os = "windows")]
    fn now_playing(track: &MediaTrack, art_dir: &Path) -> Metadata {
        metadata(track, art_dir)
    }

    #[cfg(target_os = "macos")]
    fn now_playing(track: &MediaTrack, art_dir: &Path) -> Metadata {
        macos_metadata(track, art_dir)
    }

    impl Session {
        fn new(app: &AppHandle) -> Result<Self, String> {
            let window = app
                .get_webview_window(window::MAIN)
                .ok_or_else(|| "main window is missing".to_owned())?;
            let hwnd = window_handle(&window)?;
            let controls = MediaControls::new(PlatformConfig {
                display_name: APP_NAME,
                dbus_name: "hushio",
                hwnd,
            })
            .map_err(|error| error.to_string())?;
            Ok(Self {
                controls,
                app: app.clone(),
                attached: false,
                playing: Arc::new(AtomicBool::new(false)),
                progress: None,
            })
        }

        fn attach(&mut self) -> Result<(), String> {
            let app = self.app.clone();
            let playing = Arc::clone(&self.playing);
            self.controls
                .attach(move |event| on_event(&app, &playing, event))
                .map_err(|error| error.to_string())?;
            self.attached = true;
            Ok(())
        }

        fn set_track(&mut self, track: &MediaTrack, art_dir: &Path) -> Result<(), String> {
            if !self.attached {
                self.attach()?;
            }
            let meta = now_playing(track, art_dir);
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
            self.playing.store(playing, Ordering::SeqCst);
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
            self.playing.store(false, Ordering::SeqCst);
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
            let playback = if self.playing.load(Ordering::SeqCst) {
                MediaPlayback::Playing { progress }
            } else {
                MediaPlayback::Paused { progress }
            };
            self.controls
                .set_playback(playback)
                .map_err(|error| error.to_string())
        }
    }

    fn on_event(app: &AppHandle, playing: &AtomicBool, event: MediaControlEvent) {
        let button = match event {
            MediaControlEvent::Play => Button::Play,
            MediaControlEvent::Pause => Button::Pause,
            MediaControlEvent::Toggle => play_pause_button(playing.load(Ordering::SeqCst)),
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

#[cfg(target_os = "linux")]
mod mpris {
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex, MutexGuard};
    use std::time::Duration;

    use mpris_server::zbus::{self, fdo, zvariant::ObjectPath};
    use mpris_server::{
        LoopStatus, Metadata, Property, PlaybackStatus, PlayerInterface, RootInterface, Server, Signal, Time, TrackId,
    };
    use tauri::{AppHandle, Emitter};
    use tokio::sync::mpsc;

    use super::{
        art_cache_dir, cover_file_name, cover_url, file_uri, mpris_fields, play_pause_button, seek_target,
        set_position_target, track_path, Button, MediaTrack, BUTTON_EVENT, SEEK_EVENT,
    };
    use crate::{tray, window, APP_NAME, APP_SLUG};

    const MAX_COVER_BYTES: usize = 10 * 1024 * 1024;
    const COVER_TIMEOUT: Duration = Duration::from_secs(10);

    #[derive(Default)]
    struct Now {
        track: Option<MediaTrack>,
        track_id: String,
        art: Option<String>,
        playing: bool,
        position: f64,
        duration: f64,
    }

    type Shared = Arc<Mutex<Now>>;

    enum Update {
        Track { track: MediaTrack, art_dir: PathBuf },
        Playing,
        Clear,
        Seeked(Time),
    }

    fn lock(now: &Shared) -> MutexGuard<'_, Now> {
        now.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn track_id(path: &str) -> TrackId {
        ObjectPath::try_from(path.to_owned())
            .map(TrackId::from)
            .unwrap_or(TrackId::NO_TRACK)
    }

    fn loaded(now: &Now) -> bool {
        now.track.is_some()
    }

    fn status(now: &Now) -> PlaybackStatus {
        if !loaded(now) {
            PlaybackStatus::Stopped
        } else if now.playing {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        }
    }

    fn metadata(now: &Now) -> Metadata {
        let Some(track) = &now.track else {
            return Metadata::new();
        };
        let fields = mpris_fields(track, now.art.clone());
        let mut builder = Metadata::builder()
            .trackid(track_id(&fields.track_id))
            .title(fields.title);
        if let Some(artist) = fields.artist {
            builder = builder.artist([artist]);
        }
        if let Some(album) = fields.album {
            builder = builder.album(album);
        }
        if let Some(length) = fields.length_micros {
            builder = builder.length(Time::from_micros(length));
        }
        if let Some(url) = fields.art_url {
            builder = builder.art_url(url);
        }
        builder.build()
    }

    fn status_properties(now: &Now) -> Vec<Property> {
        vec![Property::PlaybackStatus(status(now))]
    }

    fn full_properties(now: &Now) -> Vec<Property> {
        let loaded = loaded(now);
        vec![
            Property::PlaybackStatus(status(now)),
            Property::Metadata(metadata(now)),
            Property::CanGoNext(loaded),
            Property::CanGoPrevious(loaded),
            Property::CanPlay(loaded),
            Property::CanPause(loaded),
            Property::CanSeek(now.duration > 0.0),
        ]
    }

    async fn fetch_cover(url: &str) -> Option<Vec<u8>> {
        let client = reqwest::Client::builder().timeout(COVER_TIMEOUT).build().ok()?;
        let response = client.get(url).send().await.ok()?.error_for_status().ok()?;
        let is_image = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("image/"));
        if !is_image {
            return None;
        }
        let bytes = response.bytes().await.ok()?;
        (bytes.len() <= MAX_COVER_BYTES).then(|| bytes.to_vec())
    }

    async fn cover_for(track: &MediaTrack, art_dir: &Path) -> Option<String> {
        let source = cover_url(track.thumb.as_deref(), art_dir)?;
        let cache = art_cache_dir(
            std::env::var("XDG_CACHE_HOME").ok().as_deref(),
            std::env::var("HOME").ok().as_deref(),
        )?;
        let target = cache.join(cover_file_name(&source));
        if !target.exists() {
            std::fs::create_dir_all(&cache).ok()?;
            match source.strip_prefix("file://") {
                Some(local) => {
                    std::fs::copy(local, &target).ok()?;
                }
                None => {
                    let bytes = fetch_cover(&source).await?;
                    std::fs::write(&target, bytes).ok()?;
                }
            }
        }
        Some(file_uri(&target.to_string_lossy()))
    }

    pub struct Player {
        app: AppHandle,
        now: Shared,
        tx: mpsc::UnboundedSender<Update>,
    }

    impl Player {
        fn press(&self, button: Button) {
            if loaded(&lock(&self.now)) {
                let _ = self.app.emit(BUTTON_EVENT, button.action());
            }
        }

        fn seek_to(&self, target: f64) {
            let _ = self.app.emit(SEEK_EVENT, target);
            let _ = self.tx.send(Update::Seeked(Time::from_micros((target * 1_000_000.0).round() as i64)));
        }
    }

    impl RootInterface for Player {
        async fn raise(&self) -> fdo::Result<()> {
            window::show_main(&self.app);
            Ok(())
        }

        async fn quit(&self) -> fdo::Result<()> {
            tray::quit(&self.app);
            Ok(())
        }

        async fn can_quit(&self) -> fdo::Result<bool> {
            Ok(true)
        }

        async fn fullscreen(&self) -> fdo::Result<bool> {
            Ok(false)
        }

        async fn set_fullscreen(&self, _fullscreen: bool) -> zbus::Result<()> {
            Ok(())
        }

        async fn can_set_fullscreen(&self) -> fdo::Result<bool> {
            Ok(false)
        }

        async fn can_raise(&self) -> fdo::Result<bool> {
            Ok(true)
        }

        async fn has_track_list(&self) -> fdo::Result<bool> {
            Ok(false)
        }

        async fn identity(&self) -> fdo::Result<String> {
            Ok(APP_NAME.to_owned())
        }

        async fn desktop_entry(&self) -> fdo::Result<String> {
            Ok(APP_SLUG.to_owned())
        }

        async fn supported_uri_schemes(&self) -> fdo::Result<Vec<String>> {
            Ok(Vec::new())
        }

        async fn supported_mime_types(&self) -> fdo::Result<Vec<String>> {
            Ok(super::AUDIO_MIME_TYPES.iter().map(|mime| (*mime).to_owned()).collect())
        }
    }

    impl PlayerInterface for Player {
        async fn next(&self) -> fdo::Result<()> {
            self.press(Button::Next);
            Ok(())
        }

        async fn previous(&self) -> fdo::Result<()> {
            self.press(Button::Previous);
            Ok(())
        }

        async fn pause(&self) -> fdo::Result<()> {
            self.press(Button::Pause);
            Ok(())
        }

        async fn play_pause(&self) -> fdo::Result<()> {
            let playing = lock(&self.now).playing;
            self.press(play_pause_button(playing));
            Ok(())
        }

        async fn stop(&self) -> fdo::Result<()> {
            self.press(Button::Pause);
            Ok(())
        }

        async fn play(&self) -> fdo::Result<()> {
            self.press(Button::Play);
            Ok(())
        }

        async fn seek(&self, offset: Time) -> fdo::Result<()> {
            let (position, duration) = {
                let now = lock(&self.now);
                (now.position, now.duration)
            };
            if let Some(target) = seek_target(position, offset.as_micros(), duration) {
                self.seek_to(target);
            }
            Ok(())
        }

        async fn set_position(&self, requested: TrackId, position: Time) -> fdo::Result<()> {
            let target = {
                let now = lock(&self.now);
                set_position_target(&now.track_id, requested.as_str(), position.as_micros(), now.duration)
            };
            if let Some(target) = target {
                self.seek_to(target);
            }
            Ok(())
        }

        async fn open_uri(&self, _uri: String) -> fdo::Result<()> {
            Err(fdo::Error::NotSupported("OpenUri is not supported".to_owned()))
        }

        async fn playback_status(&self) -> fdo::Result<PlaybackStatus> {
            Ok(status(&lock(&self.now)))
        }

        async fn loop_status(&self) -> fdo::Result<LoopStatus> {
            Ok(LoopStatus::None)
        }

        async fn set_loop_status(&self, _loop_status: LoopStatus) -> zbus::Result<()> {
            Ok(())
        }

        async fn rate(&self) -> fdo::Result<f64> {
            Ok(1.0)
        }

        async fn set_rate(&self, _rate: f64) -> zbus::Result<()> {
            Ok(())
        }

        async fn shuffle(&self) -> fdo::Result<bool> {
            Ok(false)
        }

        async fn set_shuffle(&self, _shuffle: bool) -> zbus::Result<()> {
            Ok(())
        }

        async fn metadata(&self) -> fdo::Result<Metadata> {
            Ok(metadata(&lock(&self.now)))
        }

        async fn volume(&self) -> fdo::Result<f64> {
            Ok(1.0)
        }

        async fn set_volume(&self, _volume: f64) -> zbus::Result<()> {
            Ok(())
        }

        async fn position(&self) -> fdo::Result<Time> {
            Ok(Time::from_micros((lock(&self.now).position * 1_000_000.0).round() as i64))
        }

        async fn minimum_rate(&self) -> fdo::Result<f64> {
            Ok(0.5)
        }

        async fn maximum_rate(&self) -> fdo::Result<f64> {
            Ok(2.0)
        }

        async fn can_go_next(&self) -> fdo::Result<bool> {
            Ok(loaded(&lock(&self.now)))
        }

        async fn can_go_previous(&self) -> fdo::Result<bool> {
            Ok(loaded(&lock(&self.now)))
        }

        async fn can_play(&self) -> fdo::Result<bool> {
            Ok(loaded(&lock(&self.now)))
        }

        async fn can_pause(&self) -> fdo::Result<bool> {
            Ok(loaded(&lock(&self.now)))
        }

        async fn can_seek(&self) -> fdo::Result<bool> {
            Ok(lock(&self.now).duration > 0.0)
        }

        async fn can_control(&self) -> fdo::Result<bool> {
            Ok(true)
        }
    }

    async fn run(server: Server<Player>, mut rx: mpsc::UnboundedReceiver<Update>, now: Shared) {
        while let Some(update) = rx.recv().await {
            let outcome = match update {
                Update::Track { track, art_dir } => {
                    let id = track_path(&track.id);
                    let art = cover_for(&track, &art_dir).await;
                    let properties = {
                        let mut state = lock(&now);
                        if state.track_id == id {
                            state.art = art;
                        }
                        full_properties(&state)
                    };
                    server.properties_changed(properties).await
                }
                Update::Playing => {
                    let properties = status_properties(&lock(&now));
                    server.properties_changed(properties).await
                }
                Update::Clear => {
                    let properties = full_properties(&lock(&now));
                    server.properties_changed(properties).await
                }
                Update::Seeked(position) => server.emit(Signal::Seeked { position }).await,
            };
            if let Err(error) = outcome {
                tracing::warn!(%error, "media controls update failed");
            }
        }
    }

    #[derive(Default)]
    pub struct Controls {
        now: Shared,
        tx: Mutex<Option<mpsc::UnboundedSender<Update>>>,
    }

    impl Controls {
        pub fn install(&self, app: &AppHandle) {
            let (tx, rx) = mpsc::unbounded_channel();
            *self.tx.lock().unwrap_or_else(|error| error.into_inner()) = Some(tx.clone());
            let player = Player {
                app: app.clone(),
                now: self.now.clone(),
                tx,
            };
            let now = self.now.clone();
            tauri::async_runtime::spawn(async move {
                match Server::new(APP_SLUG, player).await {
                    Ok(server) => run(server, rx, now).await,
                    Err(error) => tracing::warn!(%error, "media controls unavailable: no session bus"),
                }
            });
        }

        fn send(&self, update: Update) {
            if let Some(tx) = self.tx.lock().unwrap_or_else(|error| error.into_inner()).as_ref() {
                let _ = tx.send(update);
            }
        }

        pub fn set_track(&self, track: &MediaTrack, art_dir: &Path) {
            {
                let mut now = lock(&self.now);
                now.track = Some(track.clone());
                now.track_id = track_path(&track.id);
                now.art = None;
                now.position = 0.0;
                now.duration = if track.duration.is_finite() && track.duration > 0.0 { track.duration } else { 0.0 };
            }
            self.send(Update::Track {
                track: track.clone(),
                art_dir: art_dir.to_path_buf(),
            });
        }

        pub fn set_playing(&self, playing: bool) {
            lock(&self.now).playing = playing;
            self.send(Update::Playing);
        }

        pub fn set_position(&self, position: f64, duration: f64) {
            if let Some(at) = super::clamp_position(position, duration) {
                let jumped = {
                    let mut now = lock(&self.now);
                    let jumped = super::is_seek_jump(now.position, at);
                    now.position = at;
                    now.duration = duration;
                    jumped
                };
                if jumped {
                    self.send(Update::Seeked(Time::from_micros((at * 1_000_000.0).round() as i64)));
                }
            }
        }

        pub fn clear(&self) {
            *lock(&self.now) = Now::default();
            self.send(Update::Clear);
        }
    }
}

#[cfg(target_os = "linux")]
pub use mpris::Controls;

#[cfg(any(target_os = "windows", target_os = "macos"))]
pub use platform::Controls;

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
#[derive(Default)]
pub struct Controls;

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
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
            id: "dQw4w9WgXcQ".into(),
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
    fn cover_at_the_length_limit_is_kept() {
        let url = format!("https://example.com/{}", "x".repeat(THUMB_LIMIT - "https://example.com/".len()));
        assert_eq!(url.len(), THUMB_LIMIT);
        assert_eq!(cover_url(Some(&url), &art_dir()), Some(url.clone()));
    }

    #[test]
    fn surrounding_spaces_around_a_cover_are_ignored() {
        assert_eq!(
            cover_url(Some("  https://i.ytimg.com/vi/abc/hq.jpg \n"), &art_dir()),
            Some("https://i.ytimg.com/vi/abc/hq.jpg".to_owned())
        );
    }

    #[test]
    fn asset_and_ftp_covers_are_dropped() {
        let dir = art_dir();
        assert_eq!(cover_url(Some("asset://localhost/a.jpg"), &dir), None);
        assert_eq!(cover_url(Some("ftp://example.com/a.jpg"), &dir), None);
    }

    #[test]
    fn local_art_from_another_host_is_dropped() {
        assert_eq!(cover_url(Some(&format!("localart://otherhost/{ART}")), &art_dir()), None);
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
    fn macos_local_art_is_a_percent_encoded_file_uri() {
        let dir = PathBuf::from("/Users/me/Library/Application Support/hushio/local-art");
        let url = macos_cover_url(Some(&format!("localart://{ART}")), &dir).unwrap();
        assert!(url.starts_with("file:///Users/me/Library/Application%20Support/hushio/local-art"));
        assert!(!url.contains(' '));
    }

    #[test]
    fn macos_covers_keep_https_and_drop_unsafe_local_art() {
        let url = "https://i.ytimg.com/vi/abc/hqdefault.jpg";
        assert_eq!(macos_cover_url(Some(url), &art_dir()), Some(url.to_owned()));
        assert_eq!(macos_cover_url(Some("localart://../secret.jpg"), &art_dir()), None);
        assert_eq!(macos_cover_url(Some("file:///etc/passwd"), &art_dir()), None);
    }

    #[test]
    fn macos_metadata_sends_the_encoded_cover_and_keeps_the_text() {
        let dir = PathBuf::from("/Users/me/Library/Application Support/hushio/local-art");
        let meta = macos_metadata(&track(Some(&format!("localart://{ART}")), 215.5), &dir);
        assert!(meta.cover.as_deref().is_some_and(|cover| cover.starts_with("file:///Users/me/Library/Application%20Support/")));
        assert_eq!((meta.title.as_str(), meta.album.as_str(), meta.duration), ("Song", "Hushio", 215.5));
    }

    #[test]
    fn macos_cover_is_dropped_for_empty_or_unnamed_art() {
        let dir = art_dir();
        assert_eq!(macos_cover_url(Some(""), &dir), None);
        assert_eq!(macos_cover_url(Some("localart://"), &dir), None);
        assert_eq!(macos_cover_url(Some("localart://localhost/"), &dir), None);
    }

    #[test]
    fn macos_file_uris_encode_spaces_unicode_hash_question_and_percent() {
        let dir = PathBuf::from("/Users/é/My #1?/100%/local-art");
        let url = macos_cover_url(Some(&format!("localart://{ART}")), &dir).unwrap();
        for encoded in ["%C3%A9", "%20", "%23", "%3F", "%25"] {
            assert!(url.contains(encoded), "{url} lacks {encoded}");
        }
        assert!(url.starts_with("file:///Users/%C3%A9/My%20%231%3F/100%25/local-art"));
    }

    #[test]
    fn macos_windows_style_art_paths_are_encoded_not_split() {
        let dir = PathBuf::from(r"C:\Users\me\AppData\local-art");
        let url = macos_cover_url(Some(&format!("localart://{ART}")), &dir).unwrap();
        assert!(url.starts_with("file://C%3A%5CUsers%5Cme%5CAppData%5Clocal-art"));
    }

    #[test]
    fn macos_covers_over_the_length_limit_are_dropped() {
        let url = format!("https://example.com/{}", "x".repeat(THUMB_LIMIT));
        assert_eq!(macos_cover_url(Some(&url), &art_dir()), None);
    }

    #[test]
    fn macos_metadata_keeps_missing_artist_and_album_empty() {
        let mut song = track(None, 120.0);
        song.artist = String::new();
        song.album = String::new();
        let meta = macos_metadata(&song, &art_dir());
        assert_eq!((meta.artist.as_str(), meta.album.as_str()), ("", ""));
        assert_eq!(meta.duration, 120.0);
    }

    #[test]
    fn macos_metadata_zeroes_nan_and_infinite_duration() {
        assert_eq!(macos_metadata(&track(None, f64::NAN), &art_dir()).duration, 0.0);
        assert_eq!(macos_metadata(&track(None, f64::INFINITY), &art_dir()).duration, 0.0);
        assert_eq!(macos_metadata(&track(None, -4.0), &art_dir()).duration, 0.0);
    }

    #[test]
    fn macos_metadata_clips_long_titles() {
        let mut song = track(None, 1.0);
        song.title = "t".repeat(700);
        assert_eq!(macos_metadata(&song, &art_dir()).title.chars().count(), 500);
    }

    #[test]
    fn toggle_sends_the_frontend_action_for_the_playing_flag() {
        assert_eq!(play_pause_button(true).action(), "pause");
        assert_eq!(play_pause_button(false).action(), "play");
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
    fn only_a_jump_of_more_than_a_second_counts_as_a_seek() {
        assert!(super::is_seek_jump(10.0, 30.0));
        assert!(super::is_seek_jump(30.0, 10.0));
        assert!(!super::is_seek_jump(10.0, 11.0));
        assert!(!super::is_seek_jump(10.0, 10.5));
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

    #[test]
    fn track_paths_keep_word_characters_and_mark_no_track() {
        assert_eq!(track_path("dQw4w9WgXcQ"), "/com/hushio/track/dQw4w9WgXcQ");
        assert_eq!(track_path("a-b.c/d"), "/com/hushio/track/a_b_c_d");
        assert_eq!(track_path(""), "/org/mpris/MediaPlayer2/TrackList/NoTrack");
    }

    #[test]
    fn track_paths_replace_every_non_word_character() {
        assert_eq!(track_path("é1"), "/com/hushio/track/_1");
    }

    #[test]
    fn track_ids_differing_only_by_dash_or_underscore_share_a_path() {
        assert_eq!(track_path("a-b"), track_path("a_b"));
    }

    #[test]
    fn mpris_metadata_has_the_spec_keys() {
        let song = track(Some("https://i.ytimg.com/vi/abc/hq.jpg"), 215.5);
        let fields = mpris_fields(&song, Some("file:///cache/a.jpg".into()));
        assert_eq!(fields.track_id, "/com/hushio/track/dQw4w9WgXcQ");
        assert_eq!(fields.title, "Song");
        assert_eq!(fields.artist.as_deref(), Some("Artist"));
        assert_eq!(fields.album.as_deref(), Some("Hushio"));
        assert_eq!(fields.length_micros, Some(215_500_000));
        assert_eq!(fields.art_url.as_deref(), Some("file:///cache/a.jpg"));
    }

    #[test]
    fn mpris_metadata_omits_empty_album_length_and_cover() {
        let mut song = track(None, 0.0);
        song.album = String::new();
        let fields = mpris_fields(&song, None);
        assert_eq!(fields.album, None);
        assert_eq!(fields.length_micros, None);
        assert_eq!(fields.art_url, None);
    }

    #[test]
    fn mpris_metadata_omits_the_artist_when_it_is_empty() {
        let mut song = track(None, 10.0);
        song.artist = String::new();
        assert_eq!(mpris_fields(&song, None).artist, None);
    }

    #[test]
    fn mpris_text_is_clipped_like_the_other_platforms() {
        let mut song = track(None, 10.0);
        song.title = "t".repeat(700);
        assert_eq!(mpris_fields(&song, None).title.chars().count(), 500);
    }

    #[test]
    fn mpris_artist_and_album_are_clipped_like_the_title() {
        let mut song = track(None, 10.0);
        song.artist = "a".repeat(700);
        song.album = "é".repeat(700);
        let fields = mpris_fields(&song, None);
        assert_eq!(fields.artist.unwrap().chars().count(), 500);
        assert_eq!(fields.album.as_deref().map(|text| text.chars().count()), Some(500));
    }

    #[test]
    fn mpris_clipping_never_splits_a_character() {
        let mut song = track(None, 10.0);
        song.title = format!("{}🎵🎵", "a".repeat(499));
        let title = mpris_fields(&song, None).title;
        assert_eq!(title.chars().count(), 500);
        assert!(title.ends_with('🎵'));
    }

    #[test]
    fn mpris_empty_title_stays_empty_text() {
        let mut song = track(None, 10.0);
        song.title = String::new();
        assert_eq!(mpris_fields(&song, None).title, "");
    }

    #[test]
    fn micro_lengths_need_a_finite_positive_value() {
        assert_eq!(micros(1.5), Some(1_500_000));
        assert_eq!(micros(0.0), None);
        assert_eq!(micros(f64::NAN), None);
    }

    #[test]
    fn micro_lengths_reject_infinity_and_negative_values() {
        assert_eq!(micros(f64::INFINITY), None);
        assert_eq!(micros(-1.0), None);
    }

    #[test]
    fn relative_seeks_clamp_to_the_track() {
        assert_eq!(seek_target(10.0, 5_000_000, 100.0), Some(15.0));
        assert_eq!(seek_target(2.0, -5_000_000, 100.0), Some(0.0));
        assert_eq!(seek_target(98.0, 5_000_000, 100.0), Some(100.0));
        assert_eq!(seek_target(10.0, 5_000_000, 0.0), None);
    }

    #[test]
    fn absolute_seeks_only_apply_to_the_current_track() {
        let current = track_path("abc");
        assert_eq!(set_position_target(&current, &current, 3_000_000, 10.0), Some(3.0));
        assert_eq!(set_position_target(&current, &track_path("other"), 3_000_000, 10.0), None);
    }

    #[test]
    fn absolute_seeks_clamp_to_the_track() {
        let current = track_path("abc");
        assert_eq!(set_position_target(&current, &current, -2_000_000, 10.0), Some(0.0));
        assert_eq!(set_position_target(&current, &current, 30_000_000, 10.0), Some(10.0));
        assert_eq!(set_position_target(&current, &current, 3_000_000, 0.0), None);
    }

    #[test]
    fn play_pause_sends_the_absolute_command_for_the_current_state() {
        assert_eq!(play_pause_button(true), Button::Pause);
        assert_eq!(play_pause_button(false), Button::Play);
    }

    #[test]
    fn file_uris_percent_encode_unsafe_bytes() {
        assert_eq!(file_uri("/home/u/My Art/a.jpg"), "file:///home/u/My%20Art/a.jpg");
        assert_eq!(file_uri("/x/é.jpg"), "file:///x/%C3%A9.jpg");
    }

    #[test]
    fn file_uris_escape_percent_hash_and_question_mark() {
        assert_eq!(file_uri("/x/100%#?.jpg"), "file:///x/100%25%23%3F.jpg");
    }

    #[test]
    fn cover_cache_names_are_the_sha256_of_the_source() {
        assert_eq!(
            cover_file_name(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.jpg"
        );
    }

    #[test]
    fn cover_cache_names_are_sha256_jpg() {
        let name = cover_file_name("https://i.ytimg.com/vi/abc/hq.jpg");
        assert_eq!(name.len(), 64 + ".jpg".len());
        assert!(name.ends_with(".jpg"));
        assert_eq!(name, cover_file_name("https://i.ytimg.com/vi/abc/hq.jpg"));
        assert_ne!(name, cover_file_name("https://i.ytimg.com/vi/abd/hq.jpg"));
    }

    #[test]
    fn art_cache_follows_xdg_then_home() {
        assert_eq!(
            art_cache_dir(Some("/xdg"), Some("/home/u")),
            Some(PathBuf::from("/xdg").join("hushio").join("art"))
        );
        assert_eq!(
            art_cache_dir(None, Some("/home/u")),
            Some(PathBuf::from("/home/u/.cache").join("hushio").join("art"))
        );
        assert_eq!(art_cache_dir(Some(""), None), None);
    }

    #[test]
    fn track_paths_turn_every_non_word_character_into_an_underscore() {
        assert_eq!(track_path("\u{e9} \u{fc}"), "/com/hushio/track/___");
        assert_eq!(track_path("a b"), "/com/hushio/track/a_b");
    }

    #[test]
    fn a_track_with_no_title_still_yields_the_spec_keys() {
        let mut song = track(None, 10.0);
        song.title = String::new();
        let fields = mpris_fields(&song, None);
        assert_eq!(fields.title, "");
        assert_eq!(fields.artist.as_deref(), Some("Artist"));
    }

    #[test]
    fn mpris_length_is_omitted_for_nan_and_infinite_durations() {
        assert_eq!(mpris_fields(&track(None, f64::NAN), None).length_micros, None);
        assert_eq!(mpris_fields(&track(None, f64::INFINITY), None).length_micros, None);
    }

    #[test]
    fn the_art_cache_is_unset_without_any_home_or_xdg_dir() {
        assert_eq!(art_cache_dir(None, None), None);
        assert_eq!(art_cache_dir(Some(""), Some("")), None);
    }
}

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::persist;
use crate::stats::{PlaybackEvent, TrackInput};

pub const DISCORD_CLIENT_ID: &str = "";

const OWNER: &str = "guest";
const STORE: &str = "discord";
const VERSION: u64 = 1;
const HANDSHAKE_OP: u32 = 0;
const FRAME_OP: u32 = 1;
#[cfg_attr(any(target_os = "android", target_os = "ios"), allow(dead_code))]
const PIPE_ATTEMPTS: u8 = 10;
const TICK: Duration = Duration::from_millis(250);
const RECONNECT_WAIT: Duration = Duration::from_secs(5);

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
struct Stored {
    enabled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Presence {
    pub title: String,
    pub artist: String,
    pub thumb: Option<String>,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub available: bool,
    pub enabled: bool,
    pub connected: bool,
}

pub fn configured() -> bool {
    cfg!(desktop) && !DISCORD_CLIENT_ID.is_empty()
}

fn presence_of(track: &TrackInput, start_ms: i64) -> Option<Presence> {
    if track.title.is_empty() {
        return None;
    }
    let end_ms = track
        .duration
        .filter(|seconds| *seconds > 0.0)
        .map(|seconds| start_ms + (seconds * 1000.0).round() as i64);
    Some(Presence {
        title: track.title.clone(),
        artist: track.artist.clone(),
        thumb: track.thumb.clone(),
        start_ms,
        end_ms,
    })
}

fn activity(presence: &Presence) -> Value {
    let mut assets = json!({ "large_text": presence.title });
    if let Some(thumb) = presence.thumb.as_deref().filter(|thumb| !thumb.is_empty()) {
        assets["large_image"] = json!(thumb);
    }
    let mut timestamps = json!({ "start": presence.start_ms });
    if let Some(end) = presence.end_ms {
        timestamps["end"] = json!(end);
    }
    json!({
        "type": 2,
        "name": presence.title,
        "state": presence.artist,
        "details": presence.artist,
        "assets": assets,
        "timestamps": timestamps,
    })
}

fn set_activity_frame(presence: Option<&Presence>) -> Value {
    json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": presence.map(activity),
        },
        "nonce": uuid::Uuid::new_v4().to_string(),
    })
}

enum Command {
    Show(Presence),
    Clear,
}

struct Client {
    writer: Writer,
    alive: Arc<AtomicBool>,
}

#[cfg(windows)]
enum Writer {
    Pipe(std::fs::File),
}

#[cfg(unix)]
#[cfg_attr(any(target_os = "android", target_os = "ios"), allow(dead_code))]
enum Writer {
    Socket(std::os::unix::net::UnixStream),
}

#[cfg(windows)]
fn open_pipe() -> std::io::Result<(Writer, std::fs::File)> {
    use std::os::windows::fs::OpenOptionsExt;
    for index in 0..PIPE_ATTEMPTS {
        let path = format!(r"\\?\pipe\discord-ipc-{index}");
        let handle = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .access_mode(0x3)
            .open(path);
        if let Ok(file) = handle {
            let reader = file.try_clone()?;
            return Ok((Writer::Pipe(file), reader));
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Discord isn't running",
    ))
}

#[cfg(all(unix, not(target_os = "android"), not(target_os = "ios")))]
const SOCKET_DIRS: [&str; 3] = ["", "app/com.discordapp.Discord", "snap.discord"];

#[cfg(all(unix, not(target_os = "android"), not(target_os = "ios")))]
fn socket_paths(root: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    for dir in SOCKET_DIRS {
        for index in 0..PIPE_ATTEMPTS {
            paths.push(root.join(dir).join(format!("discord-ipc-{index}")));
        }
    }
    paths
}

#[cfg(all(unix, not(target_os = "android"), not(target_os = "ios")))]
fn open_pipe() -> std::io::Result<(Writer, std::os::unix::net::UnixStream)> {
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Some(dir) = std::env::var_os("XDG_RUNTIME_DIR") {
        roots.push(std::path::PathBuf::from(dir));
    }
    if let Some(dir) = std::env::var_os("TMPDIR") {
        roots.push(std::path::PathBuf::from(dir));
    }
    roots.push(std::path::PathBuf::from("/tmp"));
    for root in roots {
        for path in socket_paths(&root) {
            if let Ok(socket) = std::os::unix::net::UnixStream::connect(path) {
                let reader = socket.try_clone()?;
                return Ok((Writer::Socket(socket), reader));
            }
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Discord isn't running",
    ))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn open_pipe() -> std::io::Result<(Writer, std::os::unix::net::UnixStream)> {
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "Discord isn't running",
    ))
}

#[cfg(windows)]
fn read_frames(reader: std::fs::File, alive: Arc<AtomicBool>) {
    let mut stream = reader;
    let mut header = [0u8; 8];
    loop {
        if stream.read_exact(&mut header).is_err() {
            break;
        }
        let length = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        let mut body = vec![0u8; length];
        if stream.read_exact(&mut body).is_err() {
            break;
        }
    }
    alive.store(false, Ordering::Relaxed);
}

#[cfg(unix)]
fn read_frames(reader: std::os::unix::net::UnixStream, alive: Arc<AtomicBool>) {
    let mut stream = reader;
    let mut header = [0u8; 8];
    loop {
        if stream.read_exact(&mut header).is_err() {
            break;
        }
        let length = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        let mut body = vec![0u8; length];
        if stream.read_exact(&mut body).is_err() {
            break;
        }
    }
    alive.store(false, Ordering::Relaxed);
}

impl Client {
    fn connect() -> std::io::Result<Self> {
        let (writer, reader) = open_pipe()?;
        let alive = Arc::new(AtomicBool::new(true));
        let flag = Arc::clone(&alive);
        std::thread::Builder::new()
            .name("discord-presence-reader".to_owned())
            .spawn(move || read_frames(reader, flag))
            .ok();
        let mut client = Self { writer, alive };
        client.write_frame(
            HANDSHAKE_OP,
            &json!({ "v": 1, "client_id": DISCORD_CLIENT_ID }),
        )?;
        Ok(client)
    }

    fn write_frame(&mut self, op: u32, payload: &Value) -> std::io::Result<()> {
        let body = payload.to_string();
        let mut frame = Vec::with_capacity(body.len() + 8);
        frame.extend_from_slice(&op.to_le_bytes());
        frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
        frame.extend_from_slice(body.as_bytes());
        match &mut self.writer {
            #[cfg(windows)]
            Writer::Pipe(file) => file.write_all(&frame),
            #[cfg(unix)]
            Writer::Socket(socket) => socket.write_all(&frame),
        }
    }

    fn set_activity(&mut self, presence: Option<&Presence>) -> std::io::Result<()> {
        if !self.alive.load(Ordering::Relaxed) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "Discord closed the connection",
            ));
        }
        self.write_frame(FRAME_OP, &set_activity_frame(presence))
    }
}

struct Inner {
    stored: Stored,
    track: Option<TrackInput>,
    playing: bool,
    played_ms: i64,
}

impl Inner {
    fn start(&mut self, track: &TrackInput) {
        self.track = Some(track.clone());
        self.playing = true;
        self.played_ms = 0;
    }

    fn resume(&mut self, track: &TrackInput) {
        self.track = Some(track.clone());
        self.playing = true;
    }

    fn elapse(&mut self, delta_ms: f64) {
        self.played_ms += delta_ms.max(0.0).round() as i64;
    }

    fn pause(&mut self, delta_ms: f64) {
        self.playing = false;
        self.elapse(delta_ms);
    }

    fn stop(&mut self) {
        self.track = None;
        self.playing = false;
        self.played_ms = 0;
    }

    fn presence(&self, now_ms: i64) -> Option<Presence> {
        if !self.playing {
            return None;
        }
        presence_of(self.track.as_ref()?, now_ms - self.played_ms)
    }
}

pub struct Service {
    sender: Mutex<Option<Sender<Command>>>,
    enabled: Arc<AtomicBool>,
    connected: Arc<AtomicBool>,
    inner: Mutex<Inner>,
    root: std::path::PathBuf,
}

impl Service {
    pub async fn load(root: std::path::PathBuf) -> Self {
        let stored = persist::read(&root, OWNER, STORE)
            .await
            .and_then(|value| {
                serde_json::from_value::<Stored>(value.get("state").cloned().unwrap_or(Value::Null)).ok()
            })
            .unwrap_or_default();
        let enabled = Arc::new(AtomicBool::new(stored.enabled));
        let connected = Arc::new(AtomicBool::new(false));
        let (sender, receiver) = std::sync::mpsc::channel();
        let service = Self {
            sender: Mutex::new(Some(sender)),
            enabled: Arc::clone(&enabled),
            connected: Arc::clone(&connected),
            inner: Mutex::new(Inner {
                stored,
                track: None,
                playing: false,
                played_ms: 0,
            }),
            root,
        };
        service.spawn(receiver, enabled, connected);
        service
    }

    fn spawn(&self, receiver: Receiver<Command>, enabled: Arc<AtomicBool>, connected: Arc<AtomicBool>) {
        std::thread::Builder::new()
            .name("discord-presence".to_owned())
            .spawn(move || worker(receiver, enabled, connected))
            .ok();
    }

    fn status(&self) -> Status {
        let inner = self.lock();
        Status {
            available: configured(),
            enabled: inner.stored.enabled,
            connected: self.connected.load(Ordering::Relaxed),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|poison| poison.into_inner())
    }

    pub fn playback(&self, event: &PlaybackEvent, now_ms: i64) {
        if !configured() || !self.enabled.load(Ordering::Relaxed) {
            return;
        }
        let kind = event.kind.as_str();
        let Some(track) = event.track.as_ref().filter(|track| !track.id.is_empty()) else {
            return;
        };
        let presence = {
            let mut inner = self.lock();
            match kind {
                "start" => inner.start(track),
                "resume" => inner.resume(track),
                "pause" => inner.pause(event.delta_ms),
                "progress" => {
                    inner.elapse(event.delta_ms);
                    return;
                }
                "stop" => inner.stop(),
                _ => return,
            }
            inner.presence(now_ms)
        };
        self.publish(presence);
    }

    fn publish(&self, presence: Option<Presence>) {
        let sender = self
            .sender
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .clone();
        let Some(sender) = sender else {
            return;
        };
        let command = match presence {
            Some(presence) => Command::Show(presence),
            None => Command::Clear,
        };
        let _ = sender.send(command);
    }

    pub async fn set_enabled(&self, enabled: bool) -> Result<Status, String> {
        {
            let mut inner = self.lock();
            inner.stored.enabled = enabled;
        }
        self.enabled.store(enabled, Ordering::Relaxed);
        self.save().await;
        let presence = if enabled {
            self.lock().presence(chrono::Utc::now().timestamp_millis())
        } else {
            None
        };
        self.publish(presence);
        Ok(self.status())
    }

    async fn save(&self) {
        let state = serde_json::to_value(self.lock().stored.clone()).unwrap_or(Value::Null);
        if let Err(error) =
            persist::write(&self.root, OWNER, STORE, &json!({ "state": state, "version": VERSION })).await
        {
            tracing::warn!("discord setting not saved: {error}");
        }
    }

    pub fn erase(&self) {
        let mut inner = self.lock();
        inner.stored = Stored::default();
        inner.stop();
        self.enabled.store(false, Ordering::Relaxed);
        self.connected.store(false, Ordering::Relaxed);
    }
}

fn worker(receiver: Receiver<Command>, enabled: Arc<AtomicBool>, connected: Arc<AtomicBool>) {
    let mut client: Option<Client> = None;
    let mut pending: Option<Option<Presence>> = None;
    let mut next_attempt = Instant::now();

    loop {
        match receiver.recv_timeout(TICK) {
            Ok(Command::Show(presence)) => pending = Some(Some(presence)),
            Ok(Command::Clear) => pending = Some(None),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }

        if !enabled.load(Ordering::Relaxed) {
            if let Some(active) = client.as_mut() {
                let _ = active.set_activity(None);
            }
            client = None;
            connected.store(false, Ordering::Relaxed);
            pending = None;
            continue;
        }

        let Some(wanted) = pending.clone() else {
            continue;
        };
        if client.is_none() {
            if Instant::now() < next_attempt {
                continue;
            }
            next_attempt = Instant::now() + RECONNECT_WAIT;
            match Client::connect() {
                Ok(fresh) => {
                    client = Some(fresh);
                    connected.store(true, Ordering::Relaxed);
                }
                Err(_) => {
                    connected.store(false, Ordering::Relaxed);
                    continue;
                }
            }
        }
        let Some(active) = client.as_mut() else {
            continue;
        };
        if active.set_activity(wanted.as_ref()).is_err() {
            client = None;
            connected.store(false, Ordering::Relaxed);
            continue;
        }
        pending = None;
    }
}

#[tauri::command]
pub fn discord_status(discord: tauri::State<'_, Arc<Service>>) -> Status {
    discord.status()
}

#[tauri::command]
pub async fn discord_set_enabled(
    discord: tauri::State<'_, Arc<Service>>,
    enabled: bool,
) -> Result<Status, String> {
    discord.set_enabled(enabled).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(title: &str, artist: &str, thumb: Option<&str>, duration: Option<f64>) -> TrackInput {
        TrackInput {
            id: "abc".to_owned(),
            title: title.to_owned(),
            artist: artist.to_owned(),
            thumb: thumb.map(str::to_owned),
            duration,
            episode: false,
        }
    }

    #[test]
    fn the_activity_lists_the_track_with_its_cover_and_times() {
        let presence = presence_of(
            &track("Song", "Artist", Some("https://img/cover.jpg"), Some(200.0)),
            1_000,
        )
        .expect("presence");
        let value = activity(&presence);
        assert_eq!(value["type"], 2);
        assert_eq!(value["name"], "Song");
        assert_eq!(value["state"], "Artist");
        assert_eq!(value["details"], "Artist");
        assert_eq!(value["assets"]["large_image"], "https://img/cover.jpg");
        assert_eq!(value["timestamps"]["start"], 1_000);
        assert_eq!(value["timestamps"]["end"], 201_000);
    }

    #[test]
    fn a_track_without_a_length_has_no_end_time() {
        let presence = presence_of(&track("Song", "Artist", None, None), 5_000).expect("presence");
        let value = activity(&presence);
        assert!(value["timestamps"].get("end").is_none());
        assert!(value["assets"].get("large_image").is_none());
    }

    #[test]
    fn a_track_without_a_title_is_skipped() {
        assert!(presence_of(&track("", "Artist", None, Some(10.0)), 0).is_none());
    }

    #[test]
    fn clearing_sends_an_activity_with_nothing_in_it() {
        let frame = set_activity_frame(None);
        assert_eq!(frame["cmd"], "SET_ACTIVITY");
        assert!(frame["args"]["activity"].is_null());
    }

    #[test]
    fn the_frame_carries_the_process_id_and_a_nonce() {
        let presence = presence_of(&track("Song", "Artist", None, Some(10.0)), 0).expect("presence");
        let frame = set_activity_frame(Some(&presence));
        assert_eq!(frame["args"]["pid"], std::process::id());
        assert!(frame["nonce"].as_str().is_some_and(|nonce| !nonce.is_empty()));
    }

    #[test]
    fn a_resumed_track_keeps_the_time_already_played() {
        let mut inner = Inner { stored: Stored::default(), track: None, playing: false, played_ms: 0 };
        let song = track("Song", "Artist", None, Some(200.0));
        inner.start(&song);
        inner.pause(30_000.0);
        inner.pause(-5.0);
        assert!(inner.presence(100_000).is_none());
        inner.resume(&song);
        let presence = inner.presence(100_000).expect("presence");
        assert_eq!(presence.start_ms, 70_000);
        inner.stop();
        assert!(inner.presence(100_000).is_none());
    }

    #[test]
    fn progress_ticks_count_toward_the_time_played() {
        let mut inner = Inner { stored: Stored::default(), track: None, playing: false, played_ms: 0 };
        let song = track("Song", "Artist", None, Some(300.0));
        inner.start(&song);
        for _ in 0..24 {
            inner.elapse(5_000.0);
        }
        inner.pause(0.0);
        inner.resume(&song);
        assert_eq!(inner.presence(200_000).expect("presence").start_ms, 80_000);
    }

    #[test]
    fn enabling_shows_the_track_already_playing() {
        let mut inner = Inner { stored: Stored::default(), track: None, playing: false, played_ms: 0 };
        inner.start(&track("Song", "Artist", None, Some(200.0)));
        inner.pause(10_000.0);
        inner.resume(&track("Song", "Artist", None, Some(200.0)));
        assert_eq!(inner.presence(50_000).expect("presence").start_ms, 40_000);
    }

    #[cfg(all(unix, not(target_os = "android"), not(target_os = "ios")))]
    #[test]
    fn discord_sockets_are_also_looked_for_in_flatpak_and_snap_folders() {
        let paths = socket_paths(std::path::Path::new("/run/user/1000"));
        assert_eq!(paths[0], std::path::PathBuf::from("/run/user/1000/discord-ipc-0"));
        assert!(paths.contains(&std::path::PathBuf::from("/run/user/1000/app/com.discordapp.Discord/discord-ipc-3")));
        assert!(paths.contains(&std::path::PathBuf::from("/run/user/1000/snap.discord/discord-ipc-0")));
    }

    #[test]
    fn the_feature_is_off_until_a_client_id_is_filled_in() {
        assert!(!configured());
    }
}

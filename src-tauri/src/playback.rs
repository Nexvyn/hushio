use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader, ReadHalf, WriteHalf};
use tokio::sync::{broadcast, Mutex as AsyncMutex, oneshot};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const IPC_TIMEOUT: Duration = Duration::from_secs(5);
const START_TIMEOUT: Duration = Duration::from_secs(8);
const PROPERTY_TIME_POS: u64 = 1;
const PROPERTY_DURATION: u64 = 2;
const PROPERTY_PAUSE: u64 = 3;
const PROPERTY_IDLE: u64 = 4;
const PROPERTY_EOF: u64 = 5;
const PROPERTY_VOLUME: u64 = 6;
const PROPERTY_SPEED: u64 = 7;

const OBSERVED_PROPERTIES: [(u64, &str); 8] = [
    (PROPERTY_TIME_POS, "time-pos"),
    (PROPERTY_DURATION, "duration"),
    (PROPERTY_PAUSE, "pause"),
    (PROPERTY_IDLE, "idle-active"),
    (PROPERTY_EOF, "eof-reached"),
    (PROPERTY_VOLUME, "volume"),
    (PROPERTY_SPEED, "speed"),
    (8, "paused-for-cache"),
];

pub const EVENT: &str = "desktop-playback-event";

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Control {
    Pause { paused: bool },
    Seek { seconds: f64 },
    Volume { volume: f64 },
    Mute { muted: bool },
    Speed { speed: f64 },
    Equalizer { enabled: bool, gains: Vec<f64>, auto_headroom: bool },
    OutputDevice { id: String },
    Exclusive { enabled: bool },
    Stop,
}

pub const EXCLUSIVE_UNAVAILABLE: &str = "Exclusive output is not available on this device.";

fn exclusive_command(enabled: bool) -> Value {
    json!(["set_property", "audio-exclusive", if enabled { "yes" } else { "no" }])
}

fn should_turn_off(enabled: bool, outcome: &Result<(), String>) -> bool {
    enabled && outcome.is_err()
}

#[tauri::command]
pub async fn desktop_playback_load(
    app: AppHandle,
    deck: u8,
    generation: u64,
    source: String,
) -> Result<Snapshot, String> {
    let resolved = if source.starts_with("local:") {
        let path = app.state::<crate::local_library::Service>().track_path(&source).await
            .ok_or_else(|| "Local track is not in the library".to_owned())?;
        path
    } else if source.starts_with("net:") {
        let port = app.state::<crate::stream::StreamProxy<crate::stream::Registry>>()
            .start().await.map_err(|error| error.to_string())?;
        let mut url = url::Url::parse(&format!("http://127.0.0.1:{port}/")).map_err(|error| error.to_string())?;
        url.query_pairs_mut().append_pair("id", &source);
        url.to_string()
    } else if Path::new(&source).is_absolute() {
        app.state::<crate::reveal::Folders>().check(Path::new(&source))?;
        source
    } else {
        let port = app.state::<crate::stream::StreamProxy<crate::stream::Registry>>()
            .start().await.map_err(|error| error.to_string())?;
        validate_stream_url(&source, port)?;
        source
    };
    app.state::<Engine>().load(deck, generation, &resolved).await
}

fn validate_stream_url(source: &str, proxy_port: u16) -> Result<(), String> {
    let url = url::Url::parse(source).map_err(|_| "Invalid playback URL".to_owned())?;
    if url.scheme() == "http" && url.host_str() == Some("127.0.0.1")
        && url.port() == Some(proxy_port) && url.path() == "/" && url.username().is_empty() && url.password().is_none() {
        Ok(())
    } else {
        Err("Playback URL must use the app's stream proxy".to_owned())
    }
}

fn equalizer_filters(enabled: bool, gains: &[f64], auto_headroom: bool) -> Vec<String> {
    let mut filters = Vec::new();
    if enabled && auto_headroom {
        let headroom = gains.iter().copied().fold(0.0, f64::max);
        filters.push(format!("volume=-{headroom}dB"));
    }
    let bands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    for (index, (&frequency, &gain)) in bands.iter().zip(gains).enumerate() {
        if !enabled || gain == 0.0 {
            continue;
        }
        let filter = if index == 0 {
            format!("bass=f={frequency}:t=q:w=0.707:g={gain}")
        } else if index == bands.len() - 1 {
            format!("treble=f={frequency}:t=q:w=0.707:g={gain}")
        } else {
            format!("equalizer=f={frequency}:t=q:w=1.41:g={gain}")
        };
        filters.push(filter);
    }
    filters.push("alimiter=limit=0.944061:attack=2:release=150:level=false:latency=true".to_owned());
    filters
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{binary_runs, equalizer_filters, exclusive_command, should_turn_off, validate_stream_url};

    #[test]
    fn missing_binary_is_not_available() {
        let missing = std::path::Path::new("/nonexistent/hushio-mpv-test");
        assert!(!tauri::async_runtime::block_on(binary_runs(missing)));
    }

    #[test]
    fn exclusive_flag_becomes_the_mpv_property() {
        assert_eq!(exclusive_command(true), json!(["set_property", "audio-exclusive", "yes"]));
        assert_eq!(exclusive_command(false), json!(["set_property", "audio-exclusive", "no"]));
    }

    #[test]
    fn a_failed_enable_turns_exclusive_off() {
        let failed = Err("mpv command failed: device busy".to_owned());
        assert!(should_turn_off(true, &failed));
        assert!(!should_turn_off(true, &Ok(())));
        assert!(!should_turn_off(false, &failed));
    }

    #[test]
    fn headroom_follows_the_largest_boost_not_the_sum() {
        let loudness = [5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 4.0, 5.0];
        let filters = equalizer_filters(true, &loudness, true);
        assert_eq!(filters[0], "volume=-5dB");
        assert!(equalizer_filters(false, &loudness, true)[0].starts_with("alimiter"));
        assert!(equalizer_filters(true, &loudness, false)[0].starts_with("bass"));
    }

    #[test]
    fn a_closed_mpv_pipe_reports_shutdown_to_the_deck() {
        tauri::async_runtime::block_on(async {
            let (client_side, server_side) = tokio::io::duplex(64);
            drop(server_side);
            let stream: super::BoxedStream = Box::new(client_side);
            let (reader, _writer) = tokio::io::split(stream);
            let (events, mut received) = tokio::sync::broadcast::channel(8);
            let pending = std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
            super::read_messages(reader, pending, events, tokio_util::sync::CancellationToken::new()).await;
            assert_eq!(received.recv().await.unwrap(), json!({ "event": "shutdown" }));
        });
    }

    #[test]
    fn accepts_only_the_local_stream_proxy() {
        assert!(validate_stream_url("http://127.0.0.1:4321/?id=song", 4321).is_ok());
        assert!(validate_stream_url("https://example.com/song.mp3", 4321).is_err());
        assert!(validate_stream_url("http://127.0.0.1:4322/?id=song", 4321).is_err());
        assert!(validate_stream_url("http://127.0.0.1:4321/song", 4321).is_err());
    }
}

#[tauri::command]
pub async fn desktop_playback_control(
    engine: tauri::State<'_, Engine>,
    deck: u8,
    generation: u64,
    control: Control,
) -> Result<(), String> {
    let slot = engine.sessions.get(deck as usize).ok_or_else(|| "Invalid deck index".to_owned())?;
    let Some(session) = slot.lock().await.clone() else { return Ok(()) };
    let _operation = session.operation.lock().await;
    if session.generation.load(Ordering::SeqCst) != generation { return Ok(()) }
    match control {
        Control::Pause { paused } => engine.pause(deck, paused).await,
        Control::Seek { seconds } => engine.seek(deck, seconds).await,
        Control::Volume { volume } => engine.volume(deck, volume).await,
        Control::Mute { muted } => engine.mute(deck, muted).await,
        Control::Speed { speed } => engine.speed(deck, speed).await,
        Control::Equalizer { enabled, gains, auto_headroom } => engine.equalizer(deck, enabled, &gains, auto_headroom).await,
        Control::OutputDevice { id } => engine.output_device(deck, &id).await,
        Control::Exclusive { enabled } => engine.exclusive(enabled).await,
        Control::Stop => {
            session.generation.store(0, Ordering::SeqCst);
            session.client.command(json!(["stop"])).await.map(|_| ())
        }
    }
}

#[tauri::command]
pub async fn desktop_playback_devices(engine: tauri::State<'_, Engine>) -> Result<Value, String> {
    engine.devices().await
}

#[tauri::command]
pub async fn desktop_playback_available(app: AppHandle) -> bool {
    binary_runs(&mpv_binary(&app)).await
}

async fn binary_runs(binary: &Path) -> bool {
    let mut command = tokio::process::Command::new(binary);
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    matches!(timeout(Duration::from_secs(3), command.status()).await, Ok(Ok(status)) if status.success())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub time_pos: Option<f64>,
    pub duration: Option<f64>,
    pub paused: bool,
    pub idle: bool,
    pub eof: bool,
    pub volume: f64,
    pub speed: f64,
}

#[derive(Clone, Serialize)]
struct DeckEvent {
    deck: u8,
    generation: u64,
    event: Value,
}

trait IpcStream: AsyncRead + AsyncWrite + Unpin + Send {}

impl<T> IpcStream for T where T: AsyncRead + AsyncWrite + Unpin + Send {}

type BoxedStream = Box<dyn IpcStream>;
type Pending = HashMap<u64, oneshot::Sender<Result<Value, String>>>;

struct Client {
    writer: AsyncMutex<WriteHalf<BoxedStream>>,
    pending: Arc<Mutex<Pending>>,
    events: broadcast::Sender<Value>,
    request_id: AtomicU64,
    shutdown: CancellationToken,
    reader_task: JoinHandle<()>,
}

impl Client {
    fn new(stream: BoxedStream) -> Arc<Self> {
        let (reader, writer) = tokio::io::split(stream);
        let pending: Arc<Mutex<Pending>> = Arc::new(Mutex::new(HashMap::new()));
        let (events, _) = broadcast::channel(256);
        let shutdown = CancellationToken::new();
        let task_pending = pending.clone();
        let task_events = events.clone();
        let task_shutdown = shutdown.clone();
        let reader_task = tokio::spawn(async move {
            read_messages(reader, task_pending, task_events, task_shutdown).await;
        });

        Arc::new(Self {
            writer: AsyncMutex::new(writer),
            pending,
            events,
            request_id: AtomicU64::new(0),
            shutdown,
            reader_task,
        })
    }

    async fn command(&self, command: Value) -> Result<Value, String> {
        if self.shutdown.is_cancelled() {
            return Err("mpv process is not running".to_owned());
        }
        let id = self.request_id.fetch_add(1, Ordering::Relaxed) + 1;
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().unwrap_or_else(|poison| poison.into_inner()).insert(id, sender);
        let mut writer = self.writer.lock().await;
        let line = serde_json::to_vec(&json!({ "command": command, "request_id": id }))
            .map_err(|error| error.to_string())?;
        if let Err(error) = writer.write_all(&line).await {
            self.pending.lock().unwrap_or_else(|poison| poison.into_inner()).remove(&id);
            return Err(error.to_string());
        }
        if let Err(error) = writer.write_all(b"\n").await {
            self.pending.lock().unwrap_or_else(|poison| poison.into_inner()).remove(&id);
            return Err(error.to_string());
        }
        drop(writer);

        match timeout(IPC_TIMEOUT, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("mpv closed its IPC connection".to_owned()),
            Err(_) => {
                self.pending.lock().unwrap_or_else(|poison| poison.into_inner()).remove(&id);
                Err("mpv IPC request timed out".to_owned())
            }
        }
    }

    async fn get(&self, name: &str) -> Result<Value, String> {
        let response = self.command(json!(["get_property", name])).await?;
        Ok(response)
    }

    fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.events.subscribe()
    }

    async fn set(&self, name: &str, value: Value) -> Result<(), String> {
        self.command(json!(["set_property", name, value])).await?;
        Ok(())
    }

    async fn stop(&self) {
        let _ = self.command(json!(["quit"])).await;
        self.shutdown.cancel();
        self.reader_task.abort();
    }
}

async fn read_messages(
    reader: ReadHalf<BoxedStream>,
    pending: Arc<Mutex<Pending>>,
    events: broadcast::Sender<Value>,
    shutdown: CancellationToken,
) {
    let mut lines = BufReader::new(reader).lines();
    loop {
        let line = tokio::select! {
            _ = shutdown.cancelled() => break,
            result = lines.next_line() => result,
        };
        let Ok(Some(line)) = line else { break };
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            tracing::warn!("mpv sent malformed IPC JSON");
            continue;
        };
        if let Some(id) = message.get("request_id").and_then(Value::as_u64) {
            let waiter = pending.lock().unwrap_or_else(|poison| poison.into_inner()).remove(&id);
            if let Some(waiter) = waiter {
                let error = message.get("error").and_then(Value::as_str).unwrap_or("unknown error");
                let result = if error == "success" {
                    Ok(message.get("data").cloned().unwrap_or(Value::Null))
                } else {
                    Err(format!("mpv command failed: {error}"))
                };
                let _ = waiter.send(result);
            }
        } else if message.get("event").is_some() {
            let _ = events.send(message);
        }
    }
    if !shutdown.is_cancelled() {
        let _ = events.send(json!({ "event": "shutdown" }));
    }
    shutdown.cancel();
    for (_, waiter) in pending.lock().unwrap_or_else(|poison| poison.into_inner()).drain() {
        let _ = waiter.send(Err("mpv process stopped".to_owned()));
    }
}

struct Session {
    client: Arc<Client>,
    generation: Arc<AtomicU64>,
    operation: AsyncMutex<()>,
    child: AsyncMutex<tokio::process::Child>,
    #[cfg(unix)]
    socket_dir: PathBuf,
    event_task: JoinHandle<()>,
}

struct IpcPaths {
    binary: PathBuf,
    endpoint: PathBuf,
    #[cfg(unix)]
    socket_dir: PathBuf,
}

impl Session {
    async fn stop(&self) {
        self.client.stop().await;
        let mut child = self.child.lock().await;
        let _ = child.start_kill();
        let _ = timeout(Duration::from_secs(2), child.wait()).await;
        #[cfg(unix)]
        if let Err(error) = std::fs::remove_dir_all(&self.socket_dir) {
            if error.kind() != io::ErrorKind::NotFound {
                tracing::warn!(%error, "could not remove mpv IPC directory");
            }
        }
        self.event_task.abort();
    }
}

pub struct Engine {
    app: AppHandle,
    sessions: [AsyncMutex<Option<Arc<Session>>>; 2],
    exclusive_output: AtomicBool,
}

impl Engine {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            sessions: std::array::from_fn(|_| AsyncMutex::new(None)),
            exclusive_output: AtomicBool::new(false),
        }
    }

    async fn session(&self, deck: u8) -> Result<Arc<Session>, String> {
        let slot = self.sessions.get(deck as usize).ok_or_else(|| "invalid deck index".to_owned())?;
        let mut current = slot.lock().await;
        if let Some(session) = current.as_ref() {
            if !session.client.shutdown.is_cancelled() {
                return Ok(session.clone());
            }
            session.stop().await;
        }
        let session = spawn_session(&self.app, deck).await?;
        if self.exclusive_output.load(Ordering::SeqCst) {
            if let Err(error) = session.client.command(exclusive_command(true)).await {
                tracing::warn!(%error, deck, "exclusive output unavailable");
                session.stop().await;
                self.exclusive_output.store(false, Ordering::SeqCst);
                return Err(EXCLUSIVE_UNAVAILABLE.to_owned());
            }
        }
        *current = Some(session.clone());
        Ok(session)
    }

    pub async fn exclusive(&self, enabled: bool) -> Result<(), String> {
        self.exclusive_output.store(enabled, Ordering::SeqCst);
        let outcome = self.apply_exclusive(enabled).await;
        if !should_turn_off(enabled, &outcome) {
            return outcome;
        }
        if let Err(error) = &outcome {
            tracing::warn!(%error, "exclusive output unavailable");
        }
        self.exclusive_output.store(false, Ordering::SeqCst);
        let _ = self.apply_exclusive(false).await;
        Err(EXCLUSIVE_UNAVAILABLE.to_owned())
    }

    async fn apply_exclusive(&self, enabled: bool) -> Result<(), String> {
        let mut outcome = Ok(());
        for slot in &self.sessions {
            let Some(session) = slot.lock().await.clone() else { continue };
            if session.client.shutdown.is_cancelled() {
                continue;
            }
            let result = session.client.command(exclusive_command(enabled)).await.map(|_| ());
            if outcome.is_ok() {
                outcome = result;
            }
        }
        outcome
    }

    pub async fn load(&self, deck: u8, generation: u64, source: &str) -> Result<Snapshot, String> {
        let session = self.session(deck).await?;
        let _operation = session.operation.lock().await;
        session.generation.store(0, Ordering::SeqCst);
        session.client.set("pause", json!(true)).await?;
        let mut events = session.client.subscribe();
        session.client.command(json!(["loadfile", source, "replace"])).await?;
        timeout(Duration::from_secs(30), async {
            loop {
                let event = events.recv().await.map_err(|_| "mpv event connection closed".to_owned())?;
                match event["event"].as_str() {
                    Some("file-loaded") => return Ok(()),
                    Some("end-file") if event["reason"] == "error" => {
                        return Err(format!("mpv could not load audio: {}", event["file_error"].as_str().unwrap_or("decoding failed")));
                    }
                    Some("shutdown") => return Err("mpv stopped during loading".to_owned()),
                    _ => {}
                }
            }
        }).await.map_err(|_| "mpv audio load timed out".to_owned())??;
        session.generation.store(generation, Ordering::SeqCst);
        self.snapshot(deck).await
    }

    pub async fn pause(&self, deck: u8, paused: bool) -> Result<(), String> {
        self.session(deck).await?.client.set("pause", json!(paused)).await
    }

    pub async fn seek(&self, deck: u8, seconds: f64) -> Result<(), String> {
        if !seconds.is_finite() || seconds < 0.0 {
            return Err("seek position must be a non-negative number".to_owned());
        }
        self.session(deck).await?.client.command(json!(["seek", seconds, "absolute", "exact"])).await?;
        Ok(())
    }

    pub async fn volume(&self, deck: u8, volume: f64) -> Result<(), String> {
        if !volume.is_finite() {
            return Err("volume must be a finite number".to_owned());
        }
        self.session(deck).await?.client.set("volume", json!(volume.clamp(0.0, 100.0))).await
    }

    pub async fn mute(&self, deck: u8, muted: bool) -> Result<(), String> {
        self.session(deck).await?.client.set("mute", json!(muted)).await
    }

    pub async fn speed(&self, deck: u8, speed: f64) -> Result<(), String> {
        if !speed.is_finite() || !(0.5..=2.0).contains(&speed) {
            return Err("playback speed must be between 0.5 and 2".to_owned());
        }
        self.session(deck).await?.client.set("speed", json!(speed)).await
    }

    pub async fn snapshot(&self, deck: u8) -> Result<Snapshot, String> {
        let client = self.session(deck).await?.client.clone();
        let (time_pos, duration, paused, idle, eof, volume, speed) = tokio::try_join!(
            property_f64(&client, "time-pos"),
            property_f64(&client, "duration"),
            property_bool(&client, "pause"),
            property_bool(&client, "idle-active"),
            property_bool(&client, "eof-reached"),
            property_f64(&client, "volume"),
            property_f64(&client, "speed"),
        )?;
        Ok(Snapshot {
            time_pos,
            duration,
            paused: paused.unwrap_or(true),
            idle: idle.unwrap_or(true),
            eof: eof.unwrap_or(false),
            volume: volume.unwrap_or(100.0),
            speed: speed.unwrap_or(1.0),
        })
    }

    pub async fn equalizer(&self, deck: u8, enabled: bool, gains: &[f64], auto_headroom: bool) -> Result<(), String> {
        if gains.len() != 10 || gains.iter().any(|gain| !gain.is_finite() || !(-12.0..=12.0).contains(gain)) {
            return Err("equalizer requires ten gains between -12 and 12 dB".to_owned());
        }
        let client = self.session(deck).await?.client.clone();
        let filters = equalizer_filters(enabled, gains, auto_headroom);
        client.set("af", json!(format!("lavfi=[{}]", filters.join(",")))).await
    }

    pub async fn output_device(&self, deck: u8, id: &str) -> Result<(), String> {
        // Browser sink IDs stored by older versions cannot identify mpv outputs.
        let id = if id.is_empty() || !id.contains('/') { "auto" } else { id };
        self.session(deck).await?.client.set("audio-device", json!(id)).await
    }

    pub async fn devices(&self) -> Result<Value, String> {
        self.session(0).await?.client.get("audio-device-list").await
    }

    pub async fn shutdown(&self) {
        for slot in &self.sessions {
            if let Some(session) = slot.lock().await.take() {
                session.stop().await;
            }
        }
    }
}

async fn property_f64(client: &Client, name: &str) -> Result<Option<f64>, String> {
    match client.get(name).await {
        Ok(value) => Ok(value.as_f64()),
        Err(error) if error.contains("property unavailable") => Ok(None),
        Err(error) => Err(error),
    }
}

async fn property_bool(client: &Client, name: &str) -> Result<Option<bool>, String> {
    match client.get(name).await {
        Ok(value) => Ok(value.as_bool()),
        Err(error) if error.contains("property unavailable") => Ok(None),
        Err(error) => Err(error),
    }
}

async fn spawn_session(app: &AppHandle, deck: u8) -> Result<Arc<Session>, String> {
    let paths = ipc_paths(app)?;
    let cache = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("mpv");
    std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    let mut command = tokio::process::Command::new(&paths.binary);
    command.args([
            "--no-config",
            "--load-scripts=no",
            "--idle=yes",
            "--pause=yes",
            "--vo=null",
            "--vid=no",
            "--audio-display=no",
            "--input-default-bindings=no",
            "--input-vo-keyboard=no",
            "--terminal=no",
            "--keep-open=no",
        ]);
    command
        .arg(format!("--demuxer-cache-dir={}", cache.display()))
        .arg(format!("--input-ipc-server={}", paths.endpoint.display()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(target_os = "linux")]
    if let Ok(resource) = app.path().resource_dir() {
        let mpv_root = resource.join("mpv");
        let library_path = [
            mpv_root.join("lib"),
            mpv_root.join("pulseaudio"),
            mpv_root.join("alsa-lib"),
        ]
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(":");
        command.env("LD_LIBRARY_PATH", library_path);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Could not start mpv. Install the bundled mpv runtime: {error}"))?;

    let stream = match connect_ipc(&paths.endpoint).await {
        Ok(stream) => stream,
        Err(error) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            #[cfg(unix)]
            let _ = std::fs::remove_dir_all(&paths.socket_dir);
            return Err(error);
        }
    };
    let client = Client::new(stream);
    for (id, name) in OBSERVED_PROPERTIES {
        if let Err(error) = client.command(json!(["observe_property", id, name])).await {
            let _ = child.start_kill();
            let _ = child.wait().await;
            return Err(error);
        }
    }
    for name in ["file-loaded", "end-file", "start-file", "playback-restart", "shutdown"] {
        if let Err(error) = client.command(json!(["enable_event", name])).await {
            let _ = child.start_kill();
            let _ = child.wait().await;
            return Err(error);
        }
    }
    let mut events = client.subscribe();
    let generation = Arc::new(AtomicU64::new(0));
    let event_generation = generation.clone();
    let app = app.clone();
    let event_task = tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(event) => {
                    let generation = event_generation.load(Ordering::SeqCst);
                    if generation == 0 { continue; }
                    if let Err(error) = app.emit(EVENT, DeckEvent { deck, generation, event }) {
                        tracing::warn!(%error, deck, "could not emit desktop playback event");
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
    Ok(Arc::new(Session {
        client,
        generation,
        operation: AsyncMutex::new(()),
        child: AsyncMutex::new(child),
        #[cfg(unix)]
        socket_dir: paths.socket_dir,
        event_task,
    }))
}

fn mpv_binary(app: &AppHandle) -> PathBuf {
    if let Some(path) = std::env::var_os("HUSHIO_MPV_PATH") {
        return PathBuf::from(path);
    }
    let binary_name = if cfg!(windows) { "mpv.exe" } else { "mpv" };
    if let Ok(resource) = app.path().resource_dir() {
        for candidate in [
            resource.join("mpv").join(binary_name),
            resource.join("mpv/bin").join(binary_name),
            resource.join("binaries/mpv").join(binary_name),
        ] {
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    PathBuf::from(binary_name)
}

#[cfg(unix)]
fn ipc_paths(app: &AppHandle) -> Result<IpcPaths, String> {
    use std::os::unix::fs::PermissionsExt;
    let directory = std::env::temp_dir().join(format!("hushio-{}", Uuid::new_v4()));
    std::fs::create_dir(&directory).map_err(|error| error.to_string())?;
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
        .map_err(|error| error.to_string())?;
    Ok(IpcPaths {
        binary: mpv_binary(app),
        endpoint: directory.join("mpv.sock"),
        socket_dir: directory,
    })
}

#[cfg(windows)]
fn ipc_paths(app: &AppHandle) -> Result<IpcPaths, String> {
    Ok(IpcPaths {
        binary: mpv_binary(app),
        endpoint: PathBuf::from(format!("\\\\.\\pipe\\hushio-mpv-{}", Uuid::new_v4())),
    })
}

#[cfg(unix)]
async fn connect_ipc(path: &Path) -> Result<BoxedStream, String> {
    let deadline = tokio::time::Instant::now() + START_TIMEOUT;
    loop {
        match tokio::net::UnixStream::connect(path).await {
            Ok(stream) => return Ok(Box::new(stream)),
            Err(error) if tokio::time::Instant::now() < deadline => {
                if error.kind() != io::ErrorKind::NotFound && error.kind() != io::ErrorKind::ConnectionRefused {
                    return Err(format!("Could not connect to mpv IPC: {error}"));
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            Err(error) => return Err(format!("mpv did not open its IPC socket: {error}")),
        }
    }
}

#[cfg(windows)]
async fn connect_ipc(path: &Path) -> Result<BoxedStream, String> {
    use tokio::net::windows::named_pipe::ClientOptions;
    let pipe = path.to_string_lossy().into_owned();
    let deadline = tokio::time::Instant::now() + START_TIMEOUT;
    loop {
        match ClientOptions::new().open(&pipe) {
            Ok(stream) => return Ok(Box::new(stream)),
            Err(error) if tokio::time::Instant::now() < deadline => {
                if error.kind() != io::ErrorKind::NotFound && error.kind() != io::ErrorKind::WouldBlock {
                    return Err(format!("Could not connect to mpv IPC: {error}"));
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }
            Err(error) => return Err(format!("mpv did not open its IPC pipe: {error}")),
        }
    }
}

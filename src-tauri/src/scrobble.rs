mod listenbrainz;
mod lastfm;
#[cfg(test)]
mod tests;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::persist;
use crate::secrets::{forget_secret, keep_secret, resolve_secret, Vault};
use crate::stats::{PlaybackEvent, TrackInput};

const OWNER: &str = "guest";
const STORE: &str = "scrobble";
const VERSION: u64 = 1;
const LASTFM_SESSION: &str = "lastfm-session";
const LISTENBRAINZ_TOKEN: &str = "listenbrainz-token";
const QUEUE_CAP: usize = 500;
const BATCH: usize = 50;
const MIN_TRACK_MS: u64 = 30_000;
const MAX_THRESHOLD_MS: u64 = 240_000;
const RETRY_EVERY: Duration = Duration::from_secs(300);
const NOT_SET_UP: &str = "Last.fm isn't set up in this build";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    LastFm,
    ListenBrainz,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Scrobble {
    pub artist: String,
    pub title: String,
    pub duration_ms: Option<u64>,
    pub started_at: u64,
    #[serde(default)]
    pub video_id: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Queued {
    target: Target,
    scrobble: Scrobble,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LastfmAccount {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    session_key: Option<String>,
    username: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ListenbrainzAccount {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
    username: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
struct Stored {
    lastfm: Option<LastfmAccount>,
    lastfm_pending_token: Option<String>,
    lastfm_enabled: bool,
    listenbrainz: Option<ListenbrainzAccount>,
    listenbrainz_enabled: bool,
    queue: Vec<Queued>,
}

#[derive(Clone, Debug)]
struct Play {
    scrobble: Scrobble,
    listened_ms: u64,
    playing: bool,
    scrobbled: bool,
}

#[derive(Default)]
struct Inner {
    stored: Stored,
    play: Option<Play>,
}

#[derive(Debug, PartialEq, Eq)]
enum Effect {
    NowPlaying(Scrobble),
    Scrobble(Scrobble),
}

enum Credentials {
    LastFm(String),
    ListenBrainz(String),
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub available: bool,
    pub connected: bool,
    pub username: Option<String>,
    pub enabled: bool,
    pub awaiting_approval: bool,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScrobbleStatus {
    pub lastfm: ServiceStatus,
    pub listenbrainz: ServiceStatus,
}

#[derive(Debug, PartialEq)]
pub enum ApiError {
    Network(String),
    Service { code: u64, message: String },
    Status { status: u16 },
    Malformed,
}

impl ApiError {
    fn retry(&self) -> bool {
        match self {
            Self::Network(_) => true,
            Self::Service { code, .. } => matches!(code, 8 | 11 | 16),
            Self::Status { status } => *status == 429 || *status >= 500,
            Self::Malformed => false,
        }
    }

    fn user_message(&self, service: &str) -> String {
        match self {
            Self::Network(_) => format!("{service} couldn't be reached. Try again."),
            Self::Service { message, .. } => format!("{service} said: {message}"),
            Self::Status { status } => format!("{service} returned an error ({status})."),
            Self::Malformed => format!("{service} sent a reply Hushio didn't understand."),
        }
    }
}

impl From<reqwest::Error> for ApiError {
    fn from(error: reqwest::Error) -> Self {
        Self::Network(error.to_string())
    }
}

fn threshold_ms(duration_ms: Option<u64>) -> u64 {
    duration_ms.map_or(MAX_THRESHOLD_MS, |ms| (ms / 2).min(MAX_THRESHOLD_MS))
}

fn named(scrobble: &Scrobble) -> bool {
    !scrobble.artist.is_empty() && !scrobble.title.is_empty()
}

fn eligible(scrobble: &Scrobble) -> bool {
    named(scrobble) && scrobble.duration_ms.is_none_or(|ms| ms >= MIN_TRACK_MS)
}

fn track_duration_ms(track: &TrackInput) -> Option<u64> {
    track
        .duration
        .filter(|seconds| *seconds > 0.0)
        .map(|seconds| (seconds * 1000.0).round() as u64)
}

impl Play {
    fn new(track: &TrackInput, now: u64) -> Self {
        Self {
            scrobble: Scrobble {
                artist: track.artist.clone(),
                title: track.title.clone(),
                duration_ms: track_duration_ms(track),
                started_at: now,
                video_id: track.id.clone(),
            },
            listened_ms: 0,
            playing: false,
            scrobbled: false,
        }
    }
}

fn apply(inner: &mut Inner, event: &PlaybackEvent, now: u64) -> Vec<Effect> {
    let kind = event.kind.as_str();
    if !matches!(kind, "start" | "resume" | "progress" | "pause" | "stop") {
        return Vec::new();
    }
    if kind == "start" {
        inner.play = None;
    }
    let Some(track) = event
        .track
        .as_ref()
        .filter(|track| !track.id.is_empty() && !track.episode)
    else {
        if kind == "stop" {
            inner.play = None;
        }
        return Vec::new();
    };
    if inner
        .play
        .as_ref()
        .is_none_or(|play| play.scrobble.video_id != track.id)
    {
        inner.play = Some(Play::new(track, now));
    }
    let Some(play) = inner.play.as_mut() else {
        return Vec::new();
    };
    if let Some(ms) = track_duration_ms(track) {
        play.scrobble.duration_ms = Some(ms);
    }
    let mut effects = Vec::new();
    match kind {
        "start" | "resume" if !play.playing => {
            play.playing = true;
            if named(&play.scrobble) {
                effects.push(Effect::NowPlaying(play.scrobble.clone()));
            }
        }
        "pause" => play.playing = false,
        _ => {}
    }
    play.listened_ms += event.delta_ms.max(0.0).round() as u64;
    if !play.scrobbled
        && eligible(&play.scrobble)
        && play.listened_ms >= threshold_ms(play.scrobble.duration_ms)
    {
        play.scrobbled = true;
        effects.push(Effect::Scrobble(play.scrobble.clone()));
    }
    if kind == "stop" {
        inner.play = None;
    }
    effects
}

fn active(stored: &Stored) -> Vec<Target> {
    let mut targets = Vec::new();
    if stored.lastfm.is_some() && stored.lastfm_enabled && lastfm::configured() {
        targets.push(Target::LastFm);
    }
    if stored.listenbrainz.is_some() && stored.listenbrainz_enabled {
        targets.push(Target::ListenBrainz);
    }
    targets
}

fn slot_of(target: Target) -> &'static str {
    match target {
        Target::LastFm => LASTFM_SESSION,
        Target::ListenBrainz => LISTENBRAINZ_TOKEN,
    }
}

fn migrate(stored: &mut Stored, vault: &dyn Vault) -> bool {
    let mut moved = false;
    if let Some(account) = stored.lastfm.as_mut() {
        if let Some(secret) = account.session_key.take() {
            account.session_key = keep_secret(vault, LASTFM_SESSION, &secret);
            moved |= account.session_key.is_none();
        }
    }
    if let Some(account) = stored.listenbrainz.as_mut() {
        if let Some(secret) = account.token.take() {
            account.token = keep_secret(vault, LISTENBRAINZ_TOKEN, &secret);
            moved |= account.token.is_none();
        }
    }
    moved
}

fn cap_queue(queue: &mut Vec<Queued>) {
    let overflow = queue.len().saturating_sub(QUEUE_CAP);
    queue.drain(..overflow);
}

fn status_of(stored: &Stored) -> ScrobbleStatus {
    ScrobbleStatus {
        lastfm: ServiceStatus {
            available: lastfm::configured(),
            connected: stored.lastfm.is_some(),
            username: stored.lastfm.as_ref().map(|account| account.username.clone()),
            enabled: stored.lastfm_enabled,
            awaiting_approval: stored.lastfm_pending_token.is_some(),
        },
        listenbrainz: ServiceStatus {
            available: true,
            connected: stored.listenbrainz.is_some(),
            username: stored
                .listenbrainz
                .as_ref()
                .map(|account| account.username.clone()),
            enabled: stored.listenbrainz_enabled,
            awaiting_approval: false,
        },
    }
}

pub struct Service {
    root: PathBuf,
    http: reqwest::Client,
    inner: Mutex<Inner>,
    save_lock: tokio::sync::Mutex<()>,
    vault: Arc<dyn Vault>,
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(format!("{}/{}", crate::APP_NAME, env!("CARGO_PKG_VERSION")))
        .build()
        .unwrap_or_default()
}

impl Service {
    pub async fn load(root: PathBuf, vault: Arc<dyn Vault>) -> Self {
        let mut stored = persist::read(&root, OWNER, STORE)
            .await
            .and_then(|value| {
                serde_json::from_value::<Stored>(value.get("state").cloned().unwrap_or(Value::Null)).ok()
            })
            .unwrap_or_default();
        let moved = migrate(&mut stored, vault.as_ref());
        let service = Self {
            root,
            http: client(),
            inner: Mutex::new(Inner { stored, play: None }),
            save_lock: tokio::sync::Mutex::new(()),
            vault,
        };
        if moved {
            service.save().await;
        }
        service
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|poison| poison.into_inner())
    }

    fn secret(&self, target: Target) -> Option<String> {
        let kept = {
            let inner = self.lock();
            match target {
                Target::LastFm => inner.stored.lastfm.as_ref().and_then(|account| account.session_key.clone()),
                Target::ListenBrainz => inner.stored.listenbrainz.as_ref().and_then(|account| account.token.clone()),
            }
        };
        resolve_secret(self.vault.as_ref(), slot_of(target), kept.as_deref())
    }

    fn credentials_for(&self, target: Target) -> Option<Credentials> {
        if !active(&self.lock().stored).contains(&target) {
            return None;
        }
        let secret = self.secret(target)?;
        Some(match target {
            Target::LastFm => Credentials::LastFm(secret),
            Target::ListenBrainz => Credentials::ListenBrainz(secret),
        })
    }

    async fn save(&self) {
        let _guard = self.save_lock.lock().await;
        let stored = self.lock().stored.clone();
        let state = match serde_json::to_value(&stored) {
            Ok(state) => state,
            Err(error) => {
                tracing::warn!("scrobble state not saved: {error}");
                return;
            }
        };
        if let Err(error) =
            persist::write(&self.root, OWNER, STORE, &json!({ "state": state, "version": VERSION })).await
        {
            tracing::warn!("scrobble save failed: {error}");
        }
    }

    fn status(&self) -> ScrobbleStatus {
        status_of(&self.lock().stored)
    }

    pub fn playback(self: &Arc<Self>, event: &PlaybackEvent, now: u64) {
        let effects = apply(&mut self.lock(), event, now);
        for effect in effects {
            let service = Arc::clone(self);
            tauri::async_runtime::spawn(async move { service.deliver(effect).await });
        }
    }

    async fn deliver(&self, effect: Effect) {
        match effect {
            Effect::NowPlaying(scrobble) => {
                let targets = active(&self.lock().stored);
                for target in targets {
                    self.now_playing(target, &scrobble).await;
                }
            }
            Effect::Scrobble(scrobble) => {
                let targets = active(&self.lock().stored);
                for target in targets {
                    self.send(target, &scrobble).await;
                }
            }
        }
    }

    async fn now_playing(&self, target: Target, scrobble: &Scrobble) {
        let result = match self.credentials_for(target) {
            Some(Credentials::LastFm(key)) => lastfm::now_playing(&self.http, &key, scrobble).await,
            Some(Credentials::ListenBrainz(token)) => {
                listenbrainz::now_playing(&self.http, &token, scrobble).await
            }
            None => return,
        };
        if let Err(error) = result {
            tracing::warn!("now playing not sent: {error:?}");
        }
    }

    async fn send(&self, target: Target, scrobble: &Scrobble) {
        let result = match self.credentials_for(target) {
            Some(Credentials::LastFm(key)) => {
                lastfm::scrobble(&self.http, &key, std::slice::from_ref(scrobble)).await
            }
            Some(Credentials::ListenBrainz(token)) => {
                listenbrainz::submit(&self.http, &token, std::slice::from_ref(scrobble)).await
            }
            None => return,
        };
        match result {
            Ok(()) => {}
            Err(error) if error.retry() => {
                tracing::warn!("scrobble kept for a later retry: {error:?}");
                self.enqueue(target, scrobble);
                self.save().await;
            }
            Err(error) => tracing::warn!("scrobble dropped: {error:?}"),
        }
    }

    fn enqueue(&self, target: Target, scrobble: &Scrobble) {
        let mut inner = self.lock();
        inner.stored.queue.push(Queued {
            target,
            scrobble: scrobble.clone(),
        });
        cap_queue(&mut inner.stored.queue);
    }

    fn batch(&self, target: Target, limit: usize) -> Vec<Scrobble> {
        let inner = self.lock();
        inner
            .stored
            .queue
            .iter()
            .filter(|item| item.target == target)
            .take(limit)
            .map(|item| item.scrobble.clone())
            .collect()
    }

    fn drop_sent(&self, target: Target, count: usize) {
        let mut inner = self.lock();
        let mut left = count;
        inner.stored.queue.retain(|item| {
            if left > 0 && item.target == target {
                left -= 1;
                return false;
            }
            true
        });
    }

    pub async fn flush(&self) {
        let targets = active(&self.lock().stored);
        for target in targets {
            self.flush_target(target).await;
        }
        self.save().await;
    }

    async fn flush_target(&self, target: Target) {
        loop {
            let Some(credentials) = self.credentials_for(target) else {
                return;
            };
            let batch = self.batch(target, BATCH);
            if batch.is_empty() {
                return;
            }
            let result = match &credentials {
                Credentials::LastFm(key) => lastfm::scrobble(&self.http, key, &batch).await,
                Credentials::ListenBrainz(token) => listenbrainz::submit(&self.http, token, &batch).await,
            };
            match result {
                Ok(()) => self.drop_sent(target, batch.len()),
                Err(error) if error.retry() => {
                    tracing::warn!("scrobbles kept for a later retry: {error:?}");
                    return;
                }
                Err(error) => {
                    tracing::warn!("scrobbles dropped: {error:?}");
                    self.drop_sent(target, batch.len());
                }
            }
        }
    }

    pub async fn run_retry(self: Arc<Self>) {
        loop {
            tokio::time::sleep(RETRY_EVERY).await;
            self.flush().await;
        }
    }

    fn clear(&self, target: Target) {
        let mut inner = self.lock();
        match target {
            Target::LastFm => {
                inner.stored.lastfm = None;
                inner.stored.lastfm_pending_token = None;
                inner.stored.lastfm_enabled = false;
            }
            Target::ListenBrainz => {
                inner.stored.listenbrainz = None;
                inner.stored.listenbrainz_enabled = false;
            }
        }
        inner.stored.queue.retain(|item| item.target != target);
        drop(inner);
        forget_secret(self.vault.as_ref(), slot_of(target));
    }

    pub async fn listenbrainz_connect(&self, token: &str) -> Result<ScrobbleStatus, String> {
        let token = token.trim().to_owned();
        if token.is_empty() {
            return Err("Paste your ListenBrainz user token first.".to_owned());
        }
        let username = match listenbrainz::validate(&self.http, &token).await {
            Ok(Some(username)) => username,
            Ok(None) => {
                return Err(
                    "That token isn't valid. Copy it again from your ListenBrainz settings."
                        .to_owned(),
                )
            }
            Err(error) => return Err(error.user_message("ListenBrainz")),
        };
        let kept = keep_secret(self.vault.as_ref(), LISTENBRAINZ_TOKEN, &token);
        {
            let mut inner = self.lock();
            inner.stored.listenbrainz = Some(ListenbrainzAccount { token: kept, username });
            inner.stored.listenbrainz_enabled = true;
        }
        self.save().await;
        Ok(self.status())
    }

    pub async fn listenbrainz_disconnect(&self) -> ScrobbleStatus {
        self.clear(Target::ListenBrainz);
        self.save().await;
        self.status()
    }

    pub async fn lastfm_begin_auth(&self) -> Result<String, String> {
        if !lastfm::configured() {
            return Err(NOT_SET_UP.to_owned());
        }
        let token = lastfm::get_token(&self.http)
            .await
            .map_err(|error| error.user_message("Last.fm"))?;
        self.lock().stored.lastfm_pending_token = Some(token.clone());
        self.save().await;
        Ok(lastfm::auth_url(&token))
    }

    pub async fn lastfm_finish_auth(&self) -> Result<ScrobbleStatus, String> {
        let token = self
            .lock()
            .stored
            .lastfm_pending_token
            .clone()
            .ok_or_else(|| "Start Last.fm sign-in first.".to_owned())?;
        match lastfm::get_session(&self.http, &token).await {
            Ok((session_key, username)) => {
                let kept = keep_secret(self.vault.as_ref(), LASTFM_SESSION, &session_key);
                {
                    let mut inner = self.lock();
                    inner.stored.lastfm = Some(LastfmAccount { session_key: kept, username });
                    inner.stored.lastfm_pending_token = None;
                    inner.stored.lastfm_enabled = true;
                }
                self.save().await;
                Ok(self.status())
            }
            Err(ApiError::Service { code: 14, .. }) => Err(
                "Last.fm hasn't got your approval yet. Click Allow in the browser, then try again."
                    .to_owned(),
            ),
            Err(error) => Err(error.user_message("Last.fm")),
        }
    }

    pub async fn lastfm_disconnect(&self) -> ScrobbleStatus {
        self.clear(Target::LastFm);
        self.save().await;
        self.status()
    }

    pub async fn set_enabled(&self, service: &str, enabled: bool) -> Result<ScrobbleStatus, String> {
        {
            let mut inner = self.lock();
            match service {
                "lastfm" => inner.stored.lastfm_enabled = enabled,
                "listenbrainz" => inner.stored.listenbrainz_enabled = enabled,
                other => return Err(format!("Unknown scrobbling service: {other}")),
            }
        }
        self.save().await;
        Ok(self.status())
    }

    pub fn love(self: &Arc<Self>, artist: String, title: String, loved: bool) {
        if artist.is_empty() || title.is_empty() {
            return;
        }
        let Some(Credentials::LastFm(key)) = self.credentials_for(Target::LastFm) else {
            return;
        };
        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            if let Err(error) = lastfm::set_love(&service.http, &key, &artist, &title, loved).await {
                tracing::warn!("Last.fm love not sent: {error:?}");
            }
        });
    }

    pub fn erase(&self) {
        *self.lock() = Inner::default();
        forget_secret(self.vault.as_ref(), LASTFM_SESSION);
        forget_secret(self.vault.as_ref(), LISTENBRAINZ_TOKEN);
    }
}

#[tauri::command]
pub fn scrobble_status(scrobbles: State<'_, Arc<Service>>) -> ScrobbleStatus {
    scrobbles.status()
}

#[tauri::command]
pub async fn listenbrainz_connect(
    scrobbles: State<'_, Arc<Service>>,
    token: String,
) -> Result<ScrobbleStatus, String> {
    scrobbles.listenbrainz_connect(&token).await
}

#[tauri::command]
pub async fn listenbrainz_disconnect(scrobbles: State<'_, Arc<Service>>) -> Result<ScrobbleStatus, String> {
    Ok(scrobbles.listenbrainz_disconnect().await)
}

#[tauri::command]
pub async fn lastfm_begin_auth(
    app: AppHandle,
    scrobbles: State<'_, Arc<Service>>,
) -> Result<ScrobbleStatus, String> {
    let url = scrobbles.lastfm_begin_auth().await?;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|error| error.to_string())?;
    Ok(scrobbles.status())
}

#[tauri::command]
pub async fn lastfm_finish_auth(scrobbles: State<'_, Arc<Service>>) -> Result<ScrobbleStatus, String> {
    scrobbles.lastfm_finish_auth().await
}

#[tauri::command]
pub async fn lastfm_disconnect(scrobbles: State<'_, Arc<Service>>) -> Result<ScrobbleStatus, String> {
    Ok(scrobbles.lastfm_disconnect().await)
}

#[tauri::command]
pub async fn scrobble_set_enabled(
    scrobbles: State<'_, Arc<Service>>,
    service: String,
    enabled: bool,
) -> Result<ScrobbleStatus, String> {
    scrobbles.set_enabled(&service, enabled).await
}

#[tauri::command]
pub fn scrobble_love(scrobbles: State<'_, Arc<Service>>, artist: String, title: String, loved: bool) {
    scrobbles.love(artist, title, loved);
}

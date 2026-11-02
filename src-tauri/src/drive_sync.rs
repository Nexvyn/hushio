use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use reqwest::Method;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{Mutex as AsyncMutex, Notify};
use tokio::time::Instant;

use crate::cloud_payload;
use crate::google_auth::{GoogleAuth, TokenError};
use crate::persist;
use crate::sync_merge;
use crate::yt_data_api::{now_ms, AccessTokens};

pub const PUSH_DEBOUNCE: Duration = Duration::from_secs(10);
pub const PUSH_MAX_WAIT: Duration = Duration::from_secs(60);
pub const RETRY: Duration = Duration::from_secs(30);
pub const PULL_INTERVAL: Duration = Duration::from_secs(30);
pub const QUIT_FLUSH: Duration = Duration::from_secs(8);
pub const DRIVE_BASE: &str = "https://www.googleapis.com";

const OWNER: &str = "guest";
const BOUNDARY: &str = "hushio-drive-sync";
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);
const MSG_NOT_SIGNED_IN: &str = "Google sign-in is needed.";
const MSG_NETWORK: &str = "Couldn't reach Google. Check your connection.";

pub const SYNCED: [(&str, &str); 6] = [
    ("settings", "settings.json"),
    ("library", "library-meta.json"),
    ("listening-signals", "listening-signals.json"),
    ("recent-searches", "recent-searches.json"),
    ("listening-history", "listening-history.json"),
    ("artist-meta-cache", "artist-meta-cache.json"),
];

pub trait Session: AccessTokens {
    fn connected(&self) -> bool;
}

impl Session for GoogleAuth {
    fn connected(&self) -> bool {
        self.account().google_sub.is_some()
    }
}

impl<T: Session> Session for Arc<T> {
    fn connected(&self) -> bool {
        (**self).connected()
    }
}

pub type Drive = DriveSync<Arc<GoogleAuth>>;

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(crate::stream::USER_AGENT)
        .timeout(HTTP_TIMEOUT)
        .build()
        .unwrap_or_default()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Idle,
    Pending,
    Syncing,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub mode: &'static str,
    pub last_sync_at: Option<i64>,
    pub restore_seq: u64,
    pub restored_stores: Vec<String>,
    pub state: State,
    pub last_error: Option<String>,
    pub pending: usize,
}

pub type OnStatus = Box<dyn Fn(&Status) + Send + Sync>;

#[derive(Clone, Copy)]
struct Dirty {
    first: Instant,
    last: Instant,
}

impl Dirty {
    fn due(&self) -> Instant {
        (self.last + PUSH_DEBOUNCE).min(self.first + PUSH_MAX_WAIT)
    }
}

#[derive(Default)]
struct Inner {
    dirty: BTreeMap<&'static str, Dirty>,
    syncing: bool,
    last_sync_at: Option<i64>,
    last_error: Option<String>,
    restore_seq: u64,
    restored: Vec<String>,
    retry_at: Option<Instant>,
    next_pull: Option<Instant>,
    published: Option<Status>,
}

struct Remote {
    id: String,
    payload: Option<Value>,
}

enum Plan {
    Nothing,
    Run { stores: Vec<&'static str>, pull: bool },
}

pub struct DriveSync<T> {
    root: PathBuf,
    base: String,
    tokens: T,
    http: reqwest::Client,
    inner: Mutex<Inner>,
    run: AsyncMutex<()>,
    wake: Notify,
    on_status: OnStatus,
    stopped: AtomicBool,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn all_stores() -> Vec<&'static str> {
    SYNCED.iter().map(|(store, _)| *store).collect()
}

fn file_of(store: &str) -> Option<&'static str> {
    SYNCED.iter().find(|(name, _)| *name == store).map(|(_, file)| *file)
}

fn snapshot(inner: &Inner) -> Status {
    let state = if inner.syncing {
        State::Syncing
    } else if inner.last_error.is_some() {
        State::Error
    } else if !inner.dirty.is_empty() {
        State::Pending
    } else {
        State::Idle
    };
    Status {
        mode: "google",
        last_sync_at: inner.last_sync_at,
        restore_seq: inner.restore_seq,
        restored_stores: inner.restored.clone(),
        state,
        last_error: inner.last_error.clone(),
        pending: inner.dirty.len(),
    }
}

fn merge_store(store: &str, local: &Value, remote: &Value) -> Value {
    match store {
        "settings" => sync_merge::merge_settings(local, remote, false),
        "library" => sync_merge::merge_library(local, remote),
        "listening-signals" => sync_merge::merge_listening_signals(local, remote),
        "recent-searches" => sync_merge::merge_recent_searches(local, remote),
        "listening-history" => sync_merge::merge_listening_history(local, remote),
        "artist-meta-cache" => sync_merge::merge_artist_meta(local, remote),
        _ => local.clone(),
    }
}

fn token_error(error: TokenError) -> String {
    match error {
        TokenError::SignedOut => MSG_NOT_SIGNED_IN.to_owned(),
        TokenError::Retry => MSG_NETWORK.to_owned(),
    }
}

impl<T: Session> DriveSync<T> {
    pub fn new(root: PathBuf, base: &str, tokens: T, http: reqwest::Client, on_status: OnStatus) -> Self {
        Self {
            root,
            base: base.trim_end_matches('/').to_owned(),
            tokens,
            http,
            inner: Mutex::new(Inner::default()),
            run: AsyncMutex::new(()),
            wake: Notify::new(),
            on_status,
            stopped: AtomicBool::new(false),
        }
    }

    pub fn status(&self) -> Status {
        snapshot(&lock(&self.inner))
    }

    fn edit<R>(&self, change: impl FnOnce(&mut Inner) -> R) -> R {
        let mut inner = lock(&self.inner);
        let result = change(&mut *inner);
        let status = snapshot(&*inner);
        let changed = inner.published.as_ref() != Some(&status);
        if changed {
            inner.published = Some(status.clone());
        }
        drop(inner);
        if changed {
            (self.on_status)(&status);
        }
        result
    }

    fn halted(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }

    pub async fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        self.edit(|inner| {
            inner.dirty.clear();
            inner.retry_at = None;
            inner.next_pull = None;
        });
        let _guard = self.run.lock().await;
    }

    pub fn resume(&self) {
        self.stopped.store(false, Ordering::SeqCst);
        self.wake.notify_one();
    }

    pub fn notify_write(&self, store: &str) {
        let Some(&(name, _)) = SYNCED.iter().find(|(known, _)| *known == store) else {
            return;
        };
        if !self.tokens.connected() || self.halted() {
            return;
        }
        let now = Instant::now();
        self.edit(|inner| {
            inner
                .dirty
                .entry(name)
                .and_modify(|dirty| dirty.last = now)
                .or_insert(Dirty { first: now, last: now });
        });
        self.wake.notify_one();
    }

    pub async fn sync_now(&self) -> Status {
        if self.tokens.connected() && !self.halted() {
            if let Ok(_guard) = self.run.try_lock() {
                self.run_stores(&all_stores(), true).await;
            }
        }
        self.status()
    }

    pub async fn flush(&self) {
        if !self.tokens.connected() || self.halted() {
            return;
        }
        self.edit(|inner| inner.retry_at = None);
        let _guard = self.run.lock().await;
        self.run_stores(&all_stores(), true).await;
    }

    pub async fn run(self: Arc<Self>) {
        loop {
            match self.next_wake() {
                Some(at) => tokio::select! {
                    _ = self.wake.notified() => {}
                    _ = tokio::time::sleep_until(at) => self.tick().await,
                },
                None => self.wake.notified().await,
            }
        }
    }

    fn next_wake(&self) -> Option<Instant> {
        let inner = lock(&self.inner);
        let mut due: Vec<Instant> = inner.next_pull.into_iter().collect();
        match inner.retry_at {
            Some(retry) => due.push(retry),
            None => due.extend(inner.dirty.values().map(Dirty::due)),
        }
        due.into_iter().min()
    }

    async fn tick(&self) {
        if self.halted() {
            return;
        }
        if !self.tokens.connected() {
            self.edit(|inner| {
                inner.dirty.clear();
                inner.retry_at = None;
                inner.next_pull = None;
            });
            return;
        }
        let now = Instant::now();
        let plan = self.edit(|inner| {
            let fired = inner.retry_at.is_some_and(|at| now >= at);
            if fired {
                inner.retry_at = None;
            }
            if inner.next_pull.is_some_and(|at| now >= at) {
                return Plan::Run { stores: all_stores(), pull: true };
            }
            if inner.retry_at.is_some() {
                return Plan::Nothing;
            }
            let stores: Vec<&'static str> = if fired {
                if inner.dirty.is_empty() {
                    all_stores()
                } else {
                    inner.dirty.keys().copied().collect()
                }
            } else {
                inner
                    .dirty
                    .iter()
                    .filter(|(_, dirty)| now >= dirty.due())
                    .map(|(store, _)| *store)
                    .collect()
            };
            if stores.is_empty() {
                Plan::Nothing
            } else {
                Plan::Run { stores, pull: false }
            }
        });
        if let Plan::Run { stores, pull } = plan {
            let _guard = self.run.lock().await;
            self.run_stores(&stores, pull).await;
        }
    }

    async fn run_stores(&self, stores: &[&'static str], pull: bool) {
        let seen: Vec<(&'static str, Option<Instant>)> = self.edit(|inner| {
            inner.syncing = true;
            stores
                .iter()
                .map(|store| (*store, inner.dirty.get(store).map(|dirty| dirty.last)))
                .collect()
        });
        let mut restored = Vec::new();
        let mut failure = None;
        for (store, seen_last) in seen {
            match self.sync_store(store).await {
                Ok(wrote) => {
                    if wrote {
                        restored.push(store.to_owned());
                    }
                    self.edit(|inner| {
                        if inner.dirty.get(store).map(|dirty| dirty.last) == seen_last {
                            inner.dirty.remove(store);
                        }
                    });
                }
                Err(message) => {
                    failure = Some(message);
                    break;
                }
            }
        }
        self.edit(|inner| {
            inner.syncing = false;
            if !restored.is_empty() {
                inner.restore_seq += 1;
            }
            inner.restored = restored;
            if pull {
                inner.next_pull = Some(Instant::now() + PULL_INTERVAL);
            }
            match failure {
                None => {
                    inner.last_sync_at = Some(now_ms());
                    inner.last_error = None;
                    inner.retry_at = None;
                }
                Some(message) => {
                    inner.last_error = Some(message);
                    inner.retry_at = Some(Instant::now() + RETRY);
                }
            }
        });
    }

    async fn sync_store(&self, store: &'static str) -> Result<bool, String> {
        let Some(file) = file_of(store) else {
            return Ok(false);
        };
        let local = persist::read(&self.root, OWNER, store).await;
        let remote = self.fetch(file).await?;
        let usable = remote.as_ref().and_then(|remote| remote.payload.as_ref());
        let empty = json!({"state": {}, "version": 0});
        let merged = match usable {
            Some(payload) => merge_store(store, local.as_ref().unwrap_or(&empty), payload),
            None => match &local {
                Some(local) => local.clone(),
                None => return Ok(false),
            },
        };
        let merged = json!({"state": merged["state"], "version": merged["version"]});
        let wrote = local.as_ref() != Some(&merged);
        if wrote {
            persist::write(&self.root, OWNER, store, &merged).await?;
        }
        let upload = cloud_payload::prepare_upload(store, &merged)?;
        if usable != Some(&upload) {
            self.push(file, remote.map(|remote| remote.id), &upload).await?;
        }
        Ok(wrote)
    }

    async fn fetch(&self, file: &str) -> Result<Option<Remote>, String> {
        let Some(id) = self.find(file).await? else {
            return Ok(None);
        };
        let text = self
            .send(Method::GET, &format!("/drive/v3/files/{id}"), &[("alt", "media")], None)
            .await?;
        let payload = match serde_json::from_str::<Value>(&text) {
            Ok(value) => match cloud_payload::validate(&value, None) {
                Ok(checked) => {
                    if checked.sanitized {
                        tracing::info!(file, "Drive file was repaired and will be pushed back");
                    }
                    Some(checked.payload)
                }
                Err(message) => {
                    tracing::warn!(file, message, "Drive file was unusable and was skipped");
                    None
                }
            },
            Err(error) => {
                tracing::warn!(%error, file, "Drive file was not JSON and was skipped");
                None
            }
        };
        Ok(Some(Remote { id, payload }))
    }

    async fn find(&self, file: &str) -> Result<Option<String>, String> {
        let query = format!("name='{file}' and trashed=false");
        let text = self
            .send(
                Method::GET,
                "/drive/v3/files",
                &[
                    ("spaces", "appDataFolder"),
                    ("q", query.as_str()),
                    ("fields", "files(id,name,modifiedTime,size)"),
                    ("pageSize", "10"),
                ],
                None,
            )
            .await?;
        let reply: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        let newest = reply["files"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                let id = entry["id"].as_str()?.to_owned();
                let modified = entry["modifiedTime"].as_str().unwrap_or_default().to_owned();
                Some((modified, id))
            })
            .max_by(|a, b| a.0.cmp(&b.0))
            .map(|(_, id)| id);
        Ok(newest)
    }

    async fn push(&self, file: &str, id: Option<String>, payload: &Value) -> Result<(), String> {
        let bytes = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
        match id {
            Some(id) => {
                let path = format!("/upload/drive/v3/files/{id}");
                self.send(
                    Method::PATCH,
                    &path,
                    &[("uploadType", "media")],
                    Some(("application/json".to_owned(), bytes)),
                )
                .await?;
            }
            None => {
                let meta = json!({"name": file, "parents": ["appDataFolder"]});
                let mut body = format!(
                    "--{BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                )
                .into_bytes();
                body.extend_from_slice(&bytes);
                body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
                self.send(
                    Method::POST,
                    "/upload/drive/v3/files",
                    &[("uploadType", "multipart")],
                    Some((format!("multipart/related; boundary={BOUNDARY}"), body)),
                )
                .await?;
            }
        }
        Ok(())
    }

    pub async fn erase_app_data(&self) -> Result<usize, String> {
        let mut ids = Vec::new();
        let mut page: Option<String> = None;
        loop {
            let mut query = vec![
                ("spaces", "appDataFolder"),
                ("fields", "nextPageToken,files(id)"),
                ("pageSize", "1000"),
            ];
            if let Some(token) = page.as_deref() {
                query.push(("pageToken", token));
            }
            let text = self.send(Method::GET, "/drive/v3/files", &query, None).await?;
            let reply: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
            ids.extend(
                reply["files"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|entry| entry["id"].as_str().map(str::to_owned)),
            );
            match reply["nextPageToken"].as_str() {
                Some(next) => page = Some(next.to_owned()),
                None => break,
            }
        }
        for id in &ids {
            let (status, text) = self
                .send_raw(Method::DELETE, &format!("/drive/v3/files/{id}"), &[], None)
                .await?;
            if status != 404 {
                check(status, text)?;
            }
        }
        Ok(ids.len())
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<(String, Vec<u8>)>,
    ) -> Result<String, String> {
        let (status, text) = self.send_raw(method, path, query, body).await?;
        check(status, text)
    }

    async fn send_raw(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<(String, Vec<u8>)>,
    ) -> Result<(u16, String), String> {
        let token = self.tokens.token(false).await.map_err(token_error)?;
        let (status, text) = self.dispatch(&method, path, query, body.as_ref(), &token).await?;
        if status != 401 {
            return Ok((status, text));
        }
        let token = self.tokens.token(true).await.map_err(token_error)?;
        let (status, text) = self.dispatch(&method, path, query, body.as_ref(), &token).await?;
        if status == 401 {
            return Err(MSG_NOT_SIGNED_IN.to_owned());
        }
        Ok((status, text))
    }

    async fn dispatch(
        &self,
        method: &Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<&(String, Vec<u8>)>,
        token: &str,
    ) -> Result<(u16, String), String> {
        let mut request = self
            .http
            .request(method.clone(), format!("{}{path}", self.base))
            .bearer_auth(token)
            .query(query);
        if let Some((content_type, bytes)) = body {
            request = request
                .header(reqwest::header::CONTENT_TYPE, content_type.as_str())
                .body(bytes.clone());
        }
        let response = request.send().await.map_err(|_| MSG_NETWORK.to_owned())?;
        let status = response.status().as_u16();
        let text = response.text().await.map_err(|_| MSG_NETWORK.to_owned())?;
        Ok((status, text))
    }
}

fn check(status: u16, text: String) -> Result<String, String> {
    if (200..300).contains(&status) {
        Ok(text)
    } else {
        Err(format!("Drive returned {status}."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::future::Future;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use axum::extract::{Request, State as AxState};
    use axum::http::StatusCode;
    use axum::routing::any;
    use axum::Router;
    use tokio::net::TcpListener;

    #[derive(Clone)]
    struct Stored {
        id: String,
        name: String,
        body: String,
    }

    #[derive(Default)]
    struct DriveMock {
        files: Mutex<Vec<Stored>>,
        seen: Mutex<Vec<String>>,
        fail: Mutex<VecDeque<u16>>,
        refuse: Mutex<Vec<String>>,
    }

    impl DriveMock {
        fn writes(&self) -> usize {
            self.seen
                .lock()
                .unwrap()
                .iter()
                .filter(|line| line.starts_with("POST") || line.starts_with("PATCH"))
                .count()
        }

        fn stored(&self, name: &str) -> Option<Value> {
            let files = self.files.lock().unwrap();
            let file = files.iter().find(|file| file.name == name)?;
            serde_json::from_str(&file.body).ok()
        }

        fn seed(&self, name: &str, body: &str) {
            let mut files = self.files.lock().unwrap();
            let id = format!("file-{}", files.len() + 1);
            files.push(Stored { id, name: name.to_owned(), body: body.to_owned() });
        }
    }

    async fn handle(AxState(mock): AxState<Arc<DriveMock>>, request: Request) -> (StatusCode, String) {
        let (parts, body) = request.into_parts();
        let bytes = axum::body::to_bytes(body, usize::MAX).await.unwrap_or_default();
        let method = parts.method.to_string();
        let path = parts.uri.path().to_owned();
        mock.seen.lock().unwrap().push(format!("{method} {path}"));
        let failure = mock.fail.lock().unwrap().pop_front();
        if let Some(status) = failure {
            return (StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR), "{}".to_owned());
        }
        let query: Vec<(String, String)> = url::form_urlencoded::parse(parts.uri.query().unwrap_or_default().as_bytes())
            .into_owned()
            .collect();
        let text = String::from_utf8_lossy(&bytes).into_owned();
        match (method.as_str(), path.as_str()) {
            ("GET", "/drive/v3/files") => {
                let wanted = query.iter().find(|(key, _)| key == "q").map(|(_, value)| value.clone()).unwrap_or_default();
                let name = wanted.split('\'').nth(1).unwrap_or_default().to_owned();
                let files: Vec<Value> = mock
                    .files
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|file| wanted.is_empty() || file.name == name)
                    .map(|file| json!({"id": file.id, "name": file.name, "modifiedTime": "2026-11-09T00:00:00Z"}))
                    .collect();
                (StatusCode::OK, json!({"files": files}).to_string())
            }
            ("GET", _) if path.starts_with("/drive/v3/files/") => {
                let id = &path["/drive/v3/files/".len()..];
                let body = mock.files.lock().unwrap().iter().find(|file| file.id == id).map(|file| file.body.clone());
                match body {
                    Some(body) => (StatusCode::OK, body),
                    None => (StatusCode::NOT_FOUND, "{}".to_owned()),
                }
            }
            ("POST", "/upload/drive/v3/files") => {
                let sections: Vec<&str> = text.split(&format!("--{BOUNDARY}")).collect();
                let meta = sections[1].split_once("\r\n\r\n").map(|(_, rest)| rest.trim_end_matches("\r\n")).unwrap_or("{}");
                let content = sections[2].split_once("\r\n\r\n").map(|(_, rest)| rest.trim_end_matches("\r\n")).unwrap_or("{}");
                let name = serde_json::from_str::<Value>(meta).unwrap_or(Value::Null)["name"].as_str().unwrap_or_default().to_owned();
                let mut files = mock.files.lock().unwrap();
                let id = format!("file-{}", files.len() + 1);
                files.push(Stored { id: id.clone(), name, body: content.to_owned() });
                (StatusCode::OK, json!({"id": id}).to_string())
            }
            ("DELETE", _) if path.starts_with("/drive/v3/files/") => {
                let id = path["/drive/v3/files/".len()..].to_owned();
                if mock.refuse.lock().unwrap().contains(&id) {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "{}".to_owned());
                }
                let mut files = mock.files.lock().unwrap();
                let before = files.len();
                files.retain(|file| file.id != id);
                if files.len() == before {
                    (StatusCode::NOT_FOUND, "{}".to_owned())
                } else {
                    (StatusCode::NO_CONTENT, String::new())
                }
            }
            ("PATCH", _) if path.starts_with("/upload/drive/v3/files/") => {
                let id = &path["/upload/drive/v3/files/".len()..];
                if let Some(file) = mock.files.lock().unwrap().iter_mut().find(|file| file.id == id) {
                    file.body = text;
                }
                (StatusCode::OK, "{}".to_owned())
            }
            _ => (StatusCode::NOT_FOUND, "{}".to_owned()),
        }
    }

    async fn start_mock() -> (String, Arc<DriveMock>) {
        let mock = Arc::new(DriveMock::default());
        let app = Router::new().fallback(any(handle)).with_state(mock.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (base, mock)
    }

    struct FakeSession {
        forced: AtomicUsize,
        connected: bool,
    }

    impl AccessTokens for FakeSession {
        fn token(&self, force: bool) -> impl Future<Output = Result<String, TokenError>> + Send {
            if force {
                self.forced.fetch_add(1, Ordering::SeqCst);
            }
            std::future::ready(Ok("token-1".to_owned()))
        }
    }

    impl Session for FakeSession {
        fn connected(&self) -> bool {
            self.connected
        }
    }

    type Recorded = Arc<Mutex<Vec<Status>>>;

    fn session(connected: bool) -> FakeSession {
        FakeSession { forced: AtomicUsize::new(0), connected }
    }

    fn make(root: &std::path::Path, base: &str, session: FakeSession) -> (Arc<DriveSync<FakeSession>>, Recorded) {
        let recorded: Recorded = Arc::new(Mutex::new(Vec::new()));
        let sink = recorded.clone();
        let drive = DriveSync::new(
            root.to_path_buf(),
            base,
            session,
            reqwest::Client::new(),
            Box::new(move |status: &Status| sink.lock().unwrap().push(status.clone())),
        );
        (Arc::new(drive), recorded)
    }

    async fn local(root: &std::path::Path, store: &str, state: Value) {
        persist::write(root, OWNER, store, &json!({"state": state, "version": 1})).await.unwrap();
    }

    #[tokio::test]
    async fn erase_removes_every_app_data_file() {
        let root = tempfile::tempdir().expect("temp dir");
        let (base, mock) = start_mock().await;
        mock.seed("settings.json", "{}");
        mock.seed("library-meta.json", "{}");
        let (drive, _) = make(root.path(), &base, session(true));
        assert_eq!(drive.erase_app_data().await, Ok(2));
        assert!(mock.files.lock().unwrap().is_empty());
        assert_eq!(drive.erase_app_data().await, Ok(0));
    }

    #[tokio::test]
    async fn a_failed_erase_leaves_this_computer_alone_and_a_retry_finishes() {
        let root = tempfile::tempdir().expect("temp dir");
        local(root.path(), "settings", json!({"theme": "system"})).await;
        let (base, mock) = start_mock().await;
        mock.seed("settings.json", "{}");
        mock.seed("library-meta.json", "{}");
        mock.refuse.lock().unwrap().push("file-2".to_owned());
        let (drive, _) = make(root.path(), &base, session(true));
        assert!(drive.erase_app_data().await.is_err());
        assert_eq!(mock.files.lock().unwrap().len(), 1);
        assert!(persist::store_path(root.path(), "guest", "settings").exists());
        mock.refuse.lock().unwrap().clear();
        assert_eq!(drive.erase_app_data().await, Ok(1));
        assert!(mock.files.lock().unwrap().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn writes_inside_the_debounce_upload_once_with_the_latest_state() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        let (drive, recorded) = make(root.path(), &base, session(true));
        let worker = tokio::spawn(drive.clone().run());

        drive.notify_write("settings");
        for _ in 0..4 {
            tokio::time::advance(Duration::from_secs(2)).await;
            drive.notify_write("settings");
        }
        tokio::time::advance(Duration::from_millis(9_500)).await;
        tokio::task::yield_now().await;
        assert_eq!(mock.writes(), 0);
        tokio::time::advance(Duration::from_millis(1_000)).await;
        for _ in 0..200 {
            if mock.writes() == 1 && drive.status().state == State::Idle {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert_eq!(mock.writes(), 1);
        assert_eq!(mock.stored("settings.json").unwrap()["state"], json!({"theme": "dark"}));
        let mut states: Vec<State> = recorded.lock().unwrap().iter().map(|status| status.state).collect();
        states.dedup();
        assert_eq!(states, vec![State::Pending, State::Syncing, State::Idle]);
        worker.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn a_dirty_file_is_pushed_by_sixty_seconds_under_continuous_writes() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        let (drive, _) = make(root.path(), &base, session(true));
        let worker = tokio::spawn(drive.clone().run());
        for _ in 0..12 {
            drive.notify_write("settings");
            tokio::time::advance(Duration::from_secs(5)).await;
        }
        tokio::time::advance(Duration::from_millis(100)).await;
        for _ in 0..200 {
            if mock.writes() == 1 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        assert_eq!(mock.writes(), 1);
        worker.abort();
    }

    #[tokio::test]
    async fn pull_merges_remote_changes_then_pushes_the_result_once() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        mock.seed(
            "library-meta.json",
            r#"{"schema":1,"state":{"liked":[{"id":"remote-1","title":"Remote"}],"playlists":[]},"version":1}"#,
        );
        local(root.path(), "library", json!({"liked": [{"id": "local-1", "title": "Local"}], "playlists": []})).await;
        let (drive, recorded) = make(root.path(), &base, session(true));

        let status = drive.sync_now().await;
        assert_eq!(status.state, State::Idle);
        assert_eq!(status.restored_stores, vec!["library".to_owned()]);
        let merged = persist::read(root.path(), OWNER, "library").await.unwrap();
        let ids: Vec<&str> = merged["state"]["liked"].as_array().unwrap().iter().filter_map(|t| t["id"].as_str()).collect();
        assert!(ids.contains(&"remote-1") && ids.contains(&"local-1"), "{ids:?}");
        assert_eq!(mock.writes(), 1);
        let remote = mock.stored("library-meta.json").unwrap();
        assert_eq!(remote["state"]["liked"].as_array().unwrap().len(), 2);

        let again = drive.sync_now().await;
        assert_eq!(mock.writes(), 1, "a converged library is not pushed again");
        assert!(again.restored_stores.is_empty());
        assert!(!recorded.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_unusable_remote_file_is_overwritten_in_place() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        mock.seed("settings.json", r#"{"schema":2,"state":{},"version":1}"#);
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        let (drive, _) = make(root.path(), &base, session(true));
        assert_eq!(drive.sync_now().await.state, State::Idle);
        let seen = mock.seen.lock().unwrap().clone();
        assert!(seen.iter().any(|line| line.starts_with("PATCH /upload/drive/v3/files/file-1")), "{seen:?}");
        assert!(!seen.iter().any(|line| line.starts_with("POST")));
        assert_eq!(mock.files.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn an_expired_token_is_refreshed_once_and_the_sync_succeeds() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        mock.fail.lock().unwrap().push_back(401);
        let fake = session(true);
        let (drive, _) = make(root.path(), &base, fake);
        let status = drive.sync_now().await;
        assert_eq!(status.state, State::Idle);
        assert_eq!(status.last_error, None);
        assert_eq!(mock.writes(), 1);
        assert_eq!(drive.tokens.forced.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_failed_sync_shows_error_and_the_next_good_sync_clears_it() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        mock.fail.lock().unwrap().push_back(500);
        let (drive, _) = make(root.path(), &base, session(true));
        let failed = drive.sync_now().await;
        assert_eq!(failed.state, State::Error);
        assert_eq!(failed.last_error.as_deref(), Some("Drive returned 500."));
        assert_eq!(mock.writes(), 0);

        let recovered = drive.sync_now().await;
        assert_eq!(recovered.state, State::Idle);
        assert_eq!(recovered.last_error, None);
        assert_eq!(mock.writes(), 1);
    }

    #[tokio::test]
    async fn a_pull_with_no_remote_file_leaves_the_status_idle() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        let (drive, _) = make(root.path(), &base, session(true));
        let status = drive.sync_now().await;
        assert_eq!(status.state, State::Idle);
        assert_eq!(status.last_error, None);
        assert_eq!(mock.writes(), 0);
        assert!(mock.files.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_network_error_sets_the_error_status() {
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        let (drive, _) = make(root.path(), "http://127.0.0.1:1", session(true));
        let status = drive.sync_now().await;
        assert_eq!(status.state, State::Error);
        assert_eq!(status.last_error.as_deref(), Some("Couldn't reach Google. Check your connection."));
    }

    #[tokio::test]
    async fn quit_flush_pushes_pending_changes_without_waiting_for_the_debounce() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        let (drive, _) = make(root.path(), &base, session(true));
        drive.notify_write("settings");
        assert_eq!(drive.status().state, State::Pending);
        drive.flush().await;
        assert_eq!(mock.writes(), 1);
        assert_eq!(drive.status().state, State::Idle);
        assert_eq!(drive.status().pending, 0);
    }

    #[tokio::test]
    async fn writes_are_ignored_while_signed_out() {
        let (base, mock) = start_mock().await;
        let root = tempfile::tempdir().unwrap();
        local(root.path(), "settings", json!({"theme": "dark"})).await;
        let (drive, _) = make(root.path(), &base, session(false));
        drive.notify_write("settings");
        assert_eq!(drive.status().state, State::Idle);
        drive.flush().await;
        assert_eq!(mock.writes(), 0);
    }
}

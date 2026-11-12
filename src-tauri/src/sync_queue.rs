use std::collections::BTreeMap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::APP_NAME;
use crate::google_auth::TokenError;
use crate::persist;
use crate::yt_data_api::{
    AccessTokens, ApiError, QUOTA_LIMIT, Quota, RemoteItem, RemotePlaylist, RemoteVideo, YtApi, is_video_id, now_ms,
};
use crate::yt_innertube_auth::{Innertube, MSG_CONNECT};

const MSG_OFFLINE: &str = "Couldn't reach YouTube. Sync resumes when the connection is back.";
const MSG_SIGN_IN: &str = "Sign in with Google to see your YouTube playlists.";
const MSG_QUOTA: &str = "YouTube's daily quota is used up. It resets at midnight Pacific.";

pub const MAX_ATTEMPTS: u32 = 5;
const BACKOFF_MS: [i64; 4] = [1_000, 2_000, 4_000, 8_000];
const PACING: Duration = Duration::from_millis(250);
const OWNER: &str = "guest";
const QUEUE_FILE: &str = "sync-queue";
const QUOTA_FILE: &str = "yt-quota";
const SETTINGS_FILE: &str = "settings";

pub trait Remote: Sync {
    fn create(&self, title: &str) -> impl Future<Output = Result<String, ApiError>> + Send;
    fn rename(&self, playlist: &str, title: &str) -> impl Future<Output = Result<(), ApiError>> + Send;
    fn delete(&self, playlist: &str) -> impl Future<Output = Result<(), ApiError>> + Send;
    fn add(&self, playlist: &str, video: &str) -> impl Future<Output = Result<(), ApiError>> + Send;
    fn remove(&self, playlist: &str, video: &str) -> impl Future<Output = Result<(), ApiError>> + Send;
    fn rate(&self, video: &str, like: bool) -> impl Future<Output = Result<(), ApiError>> + Send;
}

struct Official<'a, T> {
    api: &'a YtApi,
    tokens: &'a T,
}

impl<T: AccessTokens> Remote for Official<'_, T> {
    async fn create(&self, title: &str) -> Result<String, ApiError> {
        self.api.create_playlist(self.tokens, title).await
    }

    async fn rename(&self, playlist: &str, title: &str) -> Result<(), ApiError> {
        self.api.rename_playlist(self.tokens, playlist, title).await
    }

    async fn delete(&self, playlist: &str) -> Result<(), ApiError> {
        self.api.delete_playlist(self.tokens, playlist).await
    }

    async fn add(&self, playlist: &str, video: &str) -> Result<(), ApiError> {
        self.api.add_item(self.tokens, playlist, video).await
    }

    async fn remove(&self, playlist: &str, video: &str) -> Result<(), ApiError> {
        let items: Vec<RemoteItem> = self.api.list_items(self.tokens, playlist).await?;
        let Some(item) = items.iter().find(|item| item.video_id == video) else {
            return Ok(());
        };
        match self.api.remove_item(self.tokens, &item.item_id).await {
            Err(error) if error.status() == Some(404) => Ok(()),
            other => other,
        }
    }

    async fn rate(&self, video: &str, like: bool) -> Result<(), ApiError> {
        self.api.rate(self.tokens, video, like).await
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Route {
    Official,
    Unofficial,
}

impl Route {
    fn name(self) -> &'static str {
        match self {
            Self::Official => "official",
            Self::Unofficial => "unofficial",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Create,
    Rename,
    Add,
    Remove,
    Delete,
    Like,
    Unlike,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Pending,
    Running,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub kind: Kind,
    pub local_playlist_id: Option<String>,
    pub video_id: Option<String>,
    pub yt_playlist_id: Option<String>,
    pub payload: Option<String>,
    pub attempts: u32,
    pub not_before: i64,
    pub created_at: i64,
    pub state: State,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobInput {
    pub kind: Kind,
    pub local_playlist_id: Option<String>,
    pub yt_playlist_id: Option<String>,
    pub video_id: Option<String>,
    pub payload: Option<String>,
}

#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase")]
struct Stored {
    #[serde(default)]
    jobs: Vec<Job>,
    #[serde(default)]
    links: BTreeMap<String, String>,
    #[serde(default)]
    last_synced_at: Option<i64>,
}

pub fn backoff_ms(attempts: u32) -> Option<i64> {
    if attempts == 0 || attempts >= MAX_ATTEMPTS {
        return None;
    }
    Some(BACKOFF_MS[(attempts - 1) as usize])
}

fn needs_link(kind: Kind) -> bool {
    matches!(kind, Kind::Rename | Kind::Add | Kind::Remove | Kind::Delete)
}

fn validate(input: &JobInput) -> Result<(), String> {
    let playlist_scoped = matches!(
        input.kind,
        Kind::Create | Kind::Rename | Kind::Add | Kind::Remove | Kind::Delete
    );
    let video_scoped = matches!(input.kind, Kind::Add | Kind::Remove | Kind::Like | Kind::Unlike);
    if (playlist_scoped && input.local_playlist_id.is_none()) || (video_scoped && input.video_id.is_none()) {
        return Err("The sync change is missing its playlist or video.".to_owned());
    }
    if matches!(input.kind, Kind::Create | Kind::Rename) && input.payload.is_none() {
        return Err("The sync change is missing the playlist name.".to_owned());
    }
    if matches!(input.kind, Kind::Like | Kind::Unlike) && !input.video_id.as_deref().is_some_and(is_video_id) {
        return Err("Only YouTube songs can be liked on YouTube.".to_owned());
    }
    Ok(())
}

pub struct Queue {
    root: PathBuf,
    stored: Stored,
}

impl Queue {
    pub async fn load(root: &Path) -> Self {
        let mut stored: Stored = persist::read(root, OWNER, QUEUE_FILE)
            .await
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        for job in &mut stored.jobs {
            if job.state == State::Running {
                job.state = State::Pending;
            }
        }
        Self {
            root: root.to_path_buf(),
            stored,
        }
    }

    pub async fn save(&self) -> Result<(), String> {
        let value = serde_json::to_value(&self.stored).map_err(|error| error.to_string())?;
        persist::write(&self.root, OWNER, QUEUE_FILE, &value).await
    }

    pub fn clear(&mut self) {
        self.stored = Stored::default();
    }

    pub fn link(&mut self, local: &str, yt: &str) {
        self.stored.links.insert(local.to_owned(), yt.to_owned());
    }

    pub fn enqueue(&mut self, input: JobInput, now: i64) -> Result<bool, String> {
        validate(&input)?;
        let local = input.local_playlist_id.clone();
        let video = input.video_id.clone();
        if let (Some(local), Some(yt)) = (&local, &input.yt_playlist_id) {
            self.stored.links.insert(local.clone(), yt.clone());
        }
        if needs_link(input.kind) && input.kind != Kind::Delete {
            let linked = local.as_ref().is_some_and(|id| {
                self.stored.links.contains_key(id)
                    || self
                        .stored
                        .jobs
                        .iter()
                        .any(|job| job.kind == Kind::Create && job.local_playlist_id.as_ref() == Some(id))
            });
            if !linked {
                return Ok(false);
            }
        }
        match input.kind {
            Kind::Rename => {
                self.drop_pending(|job| job.kind == Kind::Rename && job.local_playlist_id == local);
            }
            Kind::Add | Kind::Remove => {
                let opposite = if input.kind == Kind::Add { Kind::Remove } else { Kind::Add };
                if self.take_pending(|job| {
                    job.kind == opposite && job.local_playlist_id == local && job.video_id == video
                }) {
                    return Ok(false);
                }
            }
            Kind::Like | Kind::Unlike => {
                let opposite = if input.kind == Kind::Like { Kind::Unlike } else { Kind::Like };
                if self.take_pending(|job| job.kind == opposite && job.video_id == video) {
                    return Ok(false);
                }
            }
            Kind::Delete => {
                self.drop_pending(|job| job.local_playlist_id == local);
                let linked = local
                    .as_ref()
                    .is_some_and(|id| self.stored.links.contains_key(id));
                if !linked {
                    return Ok(false);
                }
            }
            Kind::Create => {}
        }
        self.stored.jobs.push(Job {
            id: Uuid::new_v4().to_string(),
            kind: input.kind,
            local_playlist_id: local,
            video_id: video,
            yt_playlist_id: input.yt_playlist_id,
            payload: input.payload,
            attempts: 0,
            not_before: now,
            created_at: now,
            state: State::Pending,
        });
        Ok(true)
    }

    fn drop_pending(&mut self, matches: impl Fn(&Job) -> bool) {
        self.stored
            .jobs
            .retain(|job| !(job.state == State::Pending && matches(job)));
    }

    fn take_pending(&mut self, matches: impl Fn(&Job) -> bool) -> bool {
        match self
            .stored
            .jobs
            .iter()
            .position(|job| job.state == State::Pending && matches(job))
        {
            Some(index) => {
                self.stored.jobs.remove(index);
                true
            }
            None => false,
        }
    }

    fn link_of(&self, job: &Job) -> Option<String> {
        job.yt_playlist_id.clone().or_else(|| {
            job.local_playlist_id
                .as_ref()
                .and_then(|local| self.stored.links.get(local).cloned())
        })
    }

    fn runnable(&self, job: &Job, now: i64) -> bool {
        job.state == State::Pending
            && job.not_before <= now
            && (!needs_link(job.kind) || self.link_of(job).is_some())
    }

    pub fn take(&mut self, now: i64) -> Option<Job> {
        let index = (0..self.stored.jobs.len())
            .filter(|&index| self.runnable(&self.stored.jobs[index], now))
            .min_by_key(|&index| self.stored.jobs[index].created_at)?;
        let link = self.link_of(&self.stored.jobs[index]);
        let job = &mut self.stored.jobs[index];
        job.state = State::Running;
        job.yt_playlist_id = link;
        Some(job.clone())
    }

    pub fn next_wake(&self, now: i64) -> Option<i64> {
        self.stored
            .jobs
            .iter()
            .filter(|job| job.state == State::Pending)
            .filter(|job| !needs_link(job.kind) || self.link_of(job).is_some())
            .map(|job| job.not_before)
            .filter(|&at| at > now)
            .min()
    }

    fn position(&self, id: &str) -> Option<usize> {
        self.stored.jobs.iter().position(|job| job.id == id)
    }

    fn release(&mut self, id: &str) {
        if let Some(index) = self.position(id) {
            self.stored.jobs[index].state = State::Pending;
        }
    }

    fn succeed(&mut self, id: &str, created: Option<String>) -> Option<(String, String)> {
        let index = self.position(id)?;
        let job = self.stored.jobs.remove(index);
        match job.kind {
            Kind::Create => {
                let (local, yt) = (job.local_playlist_id?, created?);
                self.stored.links.insert(local.clone(), yt.clone());
                for waiting in self.stored.jobs.iter_mut().filter(|other| {
                    other.local_playlist_id.as_ref() == Some(&local) && other.yt_playlist_id.is_none()
                }) {
                    waiting.yt_playlist_id = Some(yt.clone());
                }
                Some((local, yt))
            }
            Kind::Delete => {
                if let Some(local) = &job.local_playlist_id {
                    self.stored.links.remove(local);
                }
                None
            }
            _ => None,
        }
    }

    fn attempt_failed(&mut self, id: &str, now: i64) -> bool {
        let Some(index) = self.position(id) else {
            return false;
        };
        let job = &mut self.stored.jobs[index];
        job.attempts += 1;
        match backoff_ms(job.attempts) {
            Some(wait) => {
                job.state = State::Pending;
                job.not_before = now + wait;
                false
            }
            None => {
                job.state = State::Failed;
                true
            }
        }
    }

    fn drop_playlist(&mut self, local: &str) {
        self.stored
            .jobs
            .retain(|job| job.local_playlist_id.as_deref() != Some(local));
        self.stored.links.remove(local);
    }

    fn reset_failed(&mut self, now: i64) {
        for job in self.stored.jobs.iter_mut().filter(|job| job.state == State::Failed) {
            job.state = State::Pending;
            job.attempts = 0;
            job.not_before = now;
        }
    }

    fn pending_count(&self) -> usize {
        self.stored
            .jobs
            .iter()
            .filter(|job| job.state == State::Pending)
            .count()
    }

    fn failed_count(&self) -> usize {
        self.stored
            .jobs
            .iter()
            .filter(|job| job.state == State::Failed)
            .count()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Halt {
    SignIn,
    Offline,
}

#[derive(Default)]
struct Run {
    active: bool,
    halt: Option<Halt>,
    last_error: Option<String>,
    done: usize,
    total: usize,
    pulled: usize,
    playlist_name: Option<String>,
    backend: Option<&'static str>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub state: &'static str,
    pub done: usize,
    pub total: usize,
    pub playlist_name: Option<String>,
    pub backend: &'static str,
    pub quota_used_today: i64,
    pub quota_limit: i64,
    pub failed_jobs: usize,
    pub last_error: Option<String>,
    pub last_synced_at: Option<i64>,
    pub pulled_playlists: usize,
}

pub enum Event {
    Progress(Status),
    Linked {
        local_playlist_id: String,
        yt_playlist_id: String,
    },
}

#[derive(Debug, PartialEq, Eq)]
enum Step {
    Ran,
    Idle,
    Halted(Halt),
}

pub type Emit<'a> = &'a (dyn Fn(Event) + Sync);

pub struct Engine<T> {
    root: PathBuf,
    api: YtApi,
    tokens: T,
    tv: Arc<Innertube>,
    quota: Arc<StdMutex<Quota>>,
    queue: Mutex<Queue>,
    run: StdMutex<Run>,
    stopped: std::sync::atomic::AtomicBool,
}

impl<T: AccessTokens> Engine<T> {
    pub async fn load(root: PathBuf, base: &str, tokens: T, tv: Arc<Innertube>) -> Self {
        let quota: Quota = persist::read(&root, OWNER, QUOTA_FILE)
            .await
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();
        let quota = Arc::new(StdMutex::new(quota));
        let queue = Queue::load(&root).await;
        Self {
            api: YtApi::new(base, quota.clone()),
            quota,
            tokens,
            tv,
            queue: Mutex::new(queue),
            run: StdMutex::new(Run::default()),
            stopped: Default::default(),
            root,
        }
    }

    async fn route(&self, now: i64) -> Route {
        if self.unlimited().await {
            return Route::Unofficial;
        }
        let fallback = self
            .quota
            .lock()
            .map(|mut quota| quota.on_fallback(now))
            .unwrap_or(false);
        if fallback { Route::Unofficial } else { Route::Official }
    }

    async fn unlimited(&self) -> bool {
        persist::read(&self.root, OWNER, SETTINGS_FILE)
            .await
            .and_then(|value| value["state"]["unlimitedSync"].as_bool())
            .unwrap_or(false)
    }

    pub async fn enqueue(&self, inputs: Vec<JobInput>) -> Result<(), String> {
        for input in &inputs {
            validate(input)?;
        }
        let now = now_ms();
        let mut queue = self.queue.lock().await;
        let mut added = 0;
        for input in inputs {
            if queue.enqueue(input, now)? {
                added += 1;
            }
        }
        queue.save().await?;
        drop(queue);
        let mut run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
        if run.active {
            run.total += added;
        }
        Ok(())
    }

    pub async fn my_playlists(&self) -> Result<Vec<RemotePlaylist>, String> {
        self.read_allowed()?;
        self.api
            .my_playlists(&self.tokens)
            .await
            .map_err(|error| self.read_failed(error))
    }

    pub async fn playlist_videos(&self, playlist_id: &str) -> Result<Vec<RemoteVideo>, String> {
        self.read_allowed()?;
        self.api
            .playlist_videos(&self.tokens, playlist_id)
            .await
            .map_err(|error| self.read_failed(error))
    }

    pub async fn link(&self, local_playlist_id: &str, yt_playlist_id: &str) -> Result<(), String> {
        let mut queue = self.queue.lock().await;
        queue.link(local_playlist_id, yt_playlist_id);
        queue.save().await
    }

    pub async fn unlink(&self, local_playlist_id: &str) -> Result<(), String> {
        let mut queue = self.queue.lock().await;
        queue.drop_playlist(local_playlist_id);
        queue.save().await
    }

    fn read_allowed(&self) -> Result<(), String> {
        let over = self
            .quota
            .lock()
            .map(|mut quota| quota.on_fallback(now_ms()))
            .unwrap_or(false);
        if over { Err(MSG_QUOTA.to_owned()) } else { Ok(()) }
    }

    fn read_failed(&self, error: ApiError) -> String {
        if matches!(error, ApiError::Token(_)) {
            return MSG_SIGN_IN.to_owned();
        }
        if error.is_quota() {
            self.switch_to_fallback(now_ms());
            return MSG_QUOTA.to_owned();
        }
        error.describe()
    }

    pub async fn status(&self) -> Status {
        let (failed_jobs, last_synced_at) = {
            let queue = self.queue.lock().await;
            (queue.failed_count(), queue.stored.last_synced_at)
        };
        let quota_used_today = self
            .quota
            .lock()
            .map(|mut quota| quota.used(now_ms()))
            .unwrap_or(0);
        let run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
        let state = if run.active {
            "running"
        } else if run.halt == Some(Halt::SignIn) {
            "paused_sign_in"
        } else if run.halt.is_some() || run.last_error.is_some() {
            "error"
        } else {
            "idle"
        };
        Status {
            state,
            done: run.done,
            total: run.total,
            playlist_name: run.playlist_name.clone(),
            backend: run.backend.unwrap_or(Route::Official.name()),
            quota_used_today,
            quota_limit: QUOTA_LIMIT,
            failed_jobs,
            last_error: run.last_error.clone(),
            last_synced_at,
            pulled_playlists: run.pulled,
        }
    }

    pub async fn run(&self, emit: Emit<'_>) -> Option<Halt> {
        if !self.begin().await {
            return None;
        }
        self.drain(emit).await;
        self.end(emit).await;
        self.run.lock().unwrap_or_else(|poison| poison.into_inner()).halt
    }

    pub async fn stop(&self) -> Result<(), String> {
        self.stopped.store(true, std::sync::atomic::Ordering::SeqCst);
        let mut queue = self.queue.lock().await;
        queue.clear();
        queue.save().await
    }

    pub fn resume(&self) {
        self.stopped.store(false, std::sync::atomic::Ordering::SeqCst);
    }

    async fn begin(&self) -> bool {
        if self.stopped.load(std::sync::atomic::Ordering::SeqCst) {
            return false;
        }
        {
            let mut run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
            if run.active {
                return false;
            }
            *run = Run {
                active: true,
                ..Run::default()
            };
        }
        let mut queue = self.queue.lock().await;
        queue.reset_failed(now_ms());
        let total = queue.pending_count();
        if let Err(error) = queue.save().await {
            tracing::warn!(%error, "could not save the sync queue");
        }
        drop(queue);
        self.run
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .total = total;
        true
    }

    async fn drain(&self, emit: Emit<'_>) {
        if self.route(now_ms()).await == Route::Official {
            match self.api.list_playlists(&self.tokens).await {
                Ok(list) => {
                    self.run
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner())
                        .pulled = list.len();
                }
                Err(error) if error.is_quota() => self.switch_to_fallback(now_ms()),
                Err(error) => {
                    if let Some(halt) = halt_for(&error) {
                        self.halt(halt, Route::Official);
                        self.report(emit).await;
                        return;
                    }
                    self.note_error(error.describe());
                }
            }
        }
        loop {
            let now = now_ms();
            match self.step(now, emit).await {
                Step::Ran => {
                    self.report(emit).await;
                    tokio::time::sleep(PACING).await;
                }
                Step::Halted(_) => {
                    self.report(emit).await;
                    return;
                }
                Step::Idle => {
                    let wake = self.queue.lock().await.next_wake(now);
                    match wake {
                        Some(at) => {
                            let wait = (at - now).max(PACING.as_millis() as i64);
                            tokio::time::sleep(Duration::from_millis(wait as u64)).await;
                        }
                        None => return,
                    }
                }
            }
        }
    }

    async fn end(&self, emit: Emit<'_>) {
        let clean = {
            let run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
            run.halt.is_none() && run.last_error.is_none()
        };
        {
            let mut queue = self.queue.lock().await;
            if clean {
                queue.stored.last_synced_at = Some(now_ms());
            }
            if let Err(error) = queue.save().await {
                tracing::warn!(%error, "could not save the sync queue");
            }
        }
        self.run
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .active = false;
        self.report(emit).await;
    }

    async fn step(&self, now: i64, emit: Emit<'_>) -> Step {
        let route = self.route(now).await;
        let job = {
            let mut queue = self.queue.lock().await;
            let Some(job) = queue.take(now) else {
                return Step::Idle;
            };
            if let Err(error) = queue.save().await {
                tracing::warn!(%error, "could not save the sync queue");
            }
            job
        };
        {
            let mut run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
            run.playlist_name = match job.kind {
                Kind::Create | Kind::Rename => job.payload.clone(),
                _ => None,
            };
            run.backend = Some(route.name());
        }

        let outcome = self.perform(&job, route).await;
        let mut queue = self.queue.lock().await;
        let step = match outcome {
            Ok(created) => {
                self.clear_error();
                if let Some((local_playlist_id, yt_playlist_id)) = queue.succeed(&job.id, created) {
                    emit(Event::Linked {
                        local_playlist_id,
                        yt_playlist_id,
                    });
                }
                self.count_done();
                Step::Ran
            }
            Err(error) if route == Route::Official && error.is_quota() => {
                queue.release(&job.id);
                self.switch_to_fallback(now);
                Step::Ran
            }
            Err(error) => match halt_for(&error) {
                Some(halt) => {
                    queue.release(&job.id);
                    self.halt(halt, route);
                    Step::Halted(halt)
                }
                None => {
                    let gone = error.status() == Some(404)
                        && matches!(job.kind, Kind::Rename | Kind::Add | Kind::Remove | Kind::Delete);
                    match job.local_playlist_id.as_deref() {
                        Some(local) if gone => {
                            queue.drop_playlist(local);
                            self.note_error(format!(
                                "This playlist was deleted on YouTube. It's still in {APP_NAME}."
                            ));
                            self.count_done();
                        }
                        _ => {
                            if queue.attempt_failed(&job.id, now) {
                                self.count_done();
                            }
                            self.note_error(error.describe());
                        }
                    }
                    Step::Ran
                }
            },
        };
        if let Err(error) = queue.save().await {
            tracing::warn!(%error, "could not save the sync queue");
        }
        step
    }

    async fn perform(&self, job: &Job, route: Route) -> Result<Option<String>, ApiError> {
        match route {
            Route::Official => {
                let remote = Official {
                    api: &self.api,
                    tokens: &self.tokens,
                };
                perform_on(&remote, job).await
            }
            Route::Unofficial => perform_on(self.tv.as_ref(), job).await,
        }
    }

    fn switch_to_fallback(&self, now: i64) {
        if let Ok(mut quota) = self.quota.lock() {
            quota.switch_to_fallback(now);
        }
    }

    fn halt(&self, halt: Halt, route: Route) {
        let mut run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
        run.halt = Some(halt);
        if route == Route::Unofficial {
            run.last_error = Some(MSG_CONNECT.to_owned());
        } else if halt == Halt::Offline {
            run.last_error = Some(MSG_OFFLINE.to_owned());
        }
    }

    fn note_error(&self, message: String) {
        self.run
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .last_error = Some(message);
    }

    fn clear_error(&self) {
        self.run
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .last_error = None;
    }

    fn count_done(&self) {
        self.run
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .done += 1;
    }

    async fn report(&self, emit: Emit<'_>) {
        let snapshot = self.quota.lock().map(|quota| quota.clone()).unwrap_or_default();
        match serde_json::to_value(&snapshot) {
            Ok(value) => {
                if let Err(error) = persist::write(&self.root, OWNER, QUOTA_FILE, &value).await {
                    tracing::warn!(%error, "could not save the YouTube quota counter");
                }
            }
            Err(error) => tracing::warn!(%error, "could not encode the YouTube quota counter"),
        }
        emit(Event::Progress(self.status().await));
    }
}

fn halt_for(error: &ApiError) -> Option<Halt> {
    match error {
        ApiError::Token(TokenError::SignedOut) => Some(Halt::SignIn),
        ApiError::Network(_) => Some(Halt::Offline),
        _ => None,
    }
}

async fn perform_on<R: Remote>(remote: &R, job: &Job) -> Result<Option<String>, ApiError> {
    let playlist = job.yt_playlist_id.clone().unwrap_or_default();
    let video = job.video_id.clone().unwrap_or_default();
    let name = job.payload.clone().unwrap_or_default();
    match job.kind {
        Kind::Create => remote.create(&name).await.map(Some),
        Kind::Rename => remote.rename(&playlist, &name).await.map(|()| None),
        Kind::Add => remote.add(&playlist, &video).await.map(|()| None),
        Kind::Remove => remote.remove(&playlist, &video).await.map(|()| None),
        Kind::Delete => remote.delete(&playlist).await.map(|()| None),
        Kind::Like => remote.rate(&video, true).await.map(|()| None),
        Kind::Unlike => remote.rate(&video, false).await.map(|()| None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::yt_data_api::test_support::{FakeTokens, start_mock};
    use crate::yt_innertube_auth::test_support::{MemorySecret, config};
    use serde_json::json;

    fn add(local: &str, video: &str, yt: Option<&str>) -> JobInput {
        JobInput {
            kind: Kind::Add,
            local_playlist_id: Some(local.to_owned()),
            yt_playlist_id: yt.map(str::to_owned),
            video_id: Some(video.to_owned()),
            payload: None,
        }
    }

    fn create(local: &str, name: &str) -> JobInput {
        JobInput {
            kind: Kind::Create,
            local_playlist_id: Some(local.to_owned()),
            yt_playlist_id: None,
            video_id: None,
            payload: Some(name.to_owned()),
        }
    }

    fn rating(kind: Kind, video: &str) -> JobInput {
        JobInput {
            kind,
            local_playlist_id: None,
            yt_playlist_id: None,
            video_id: Some(video.to_owned()),
            payload: None,
        }
    }

    async fn engine(root: &Path, base: &str) -> Engine<FakeTokens> {
        engine_with(root, base, Some("tv-refresh")).await
    }

    async fn engine_with(root: &Path, base: &str, tv_token: Option<&str>) -> Engine<FakeTokens> {
        let tv = Arc::new(Innertube::new(config(base), MemorySecret::holding(tv_token)));
        Engine::load(root.to_path_buf(), base, FakeTokens, tv).await
    }

    async fn unlimited(root: &Path, on: bool) {
        persist::write(root, OWNER, SETTINGS_FILE, &json!({ "state": { "unlimitedSync": on }, "version": 0 }))
            .await
            .expect("settings written");
    }

    fn ignore(_: Event) {}

    #[test]
    fn backoff_follows_the_prd_schedule() {
        let waits: Vec<Option<i64>> = (1..=5).map(backoff_ms).collect();
        assert_eq!(waits, vec![Some(1_000), Some(2_000), Some(4_000), Some(8_000), None]);
    }

    #[tokio::test]
    async fn queued_jobs_survive_a_restart_and_in_flight_jobs_come_back_pending() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut queue = Queue::load(dir.path()).await;
        queue.enqueue(add("L1", "v1", Some("PL1")), 0).expect("queued");
        queue.save().await.expect("saved");
        let running = queue.take(0).expect("job starts");
        assert_eq!(running.state, State::Running);
        queue.save().await.expect("running state saved");
        drop(queue);

        let restored = Queue::load(dir.path()).await;
        assert_eq!(restored.stored.jobs.len(), 1);
        let job = &restored.stored.jobs[0];
        assert_eq!(job.state, State::Pending);
        assert_eq!(job.video_id.as_deref(), Some("v1"));
        assert_eq!(job.attempts, 0);
    }

    #[test]
    fn opposite_changes_cancel_and_renames_keep_the_last_name() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut queue = Queue {
            root: dir.path().to_path_buf(),
            stored: Stored::default(),
        };
        queue.enqueue(add("L1", "v1", Some("PL1")), 0).expect("add");
        queue.enqueue(JobInput { kind: Kind::Remove, ..add("L1", "v1", None) }, 1).expect("remove");
        assert!(queue.stored.jobs.is_empty());

        let rename = |name: &str| JobInput {
            kind: Kind::Rename,
            local_playlist_id: Some("L1".to_owned()),
            yt_playlist_id: None,
            video_id: None,
            payload: Some(name.to_owned()),
        };
        queue.enqueue(rename("First"), 2).expect("rename");
        queue.enqueue(rename("Second"), 3).expect("rename");
        assert_eq!(queue.stored.jobs.len(), 1);
        assert_eq!(queue.stored.jobs[0].payload.as_deref(), Some("Second"));
    }

    #[test]
    fn changes_wait_for_a_playlist_that_is_created_or_linked() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut queue = Queue {
            root: dir.path().to_path_buf(),
            stored: Stored::default(),
        };
        assert!(!queue.enqueue(add("L9", "v1", None), 0).expect("ignored"));
        assert!(queue.stored.jobs.is_empty());
        assert!(queue.enqueue(create("L9", "Mix"), 1).expect("create"));
        assert!(queue.enqueue(add("L9", "v1", None), 2).expect("held"));
        assert_eq!(queue.stored.jobs.len(), 2);
    }

    #[test]
    fn queued_writes_run_in_the_order_they_were_added() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut queue = Queue {
            root: dir.path().to_path_buf(),
            stored: Stored::default(),
        };
        for (at, video) in [(0, "v1"), (1, "v2"), (2, "v3")] {
            queue.enqueue(add("L1", video, Some("PL1")), at).expect("queued");
        }
        let mut order = Vec::new();
        while let Some(job) = queue.take(10) {
            order.push(job.video_id.clone().unwrap_or_default());
            queue.succeed(&job.id, None);
        }
        assert_eq!(order, vec!["v1", "v2", "v3"]);
    }

    #[tokio::test]
    async fn a_network_error_stops_the_queue_and_keeps_the_job_without_spending_an_attempt() {
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), "http://127.0.0.1:1").await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        let now = now_ms() + 1_000_000;
        assert_eq!(engine.step(now, &ignore).await, Step::Halted(Halt::Offline));
        let queue = engine.queue.lock().await;
        assert_eq!(queue.stored.jobs.len(), 1);
        assert_eq!(queue.stored.jobs[0].state, State::Pending);
        assert_eq!(queue.stored.jobs[0].attempts, 0);
    }

    #[tokio::test]
    async fn a_failing_job_retries_on_the_backoff_schedule_and_stops_after_five_attempts() {
        let (base, mock) = start_mock().await;
        for _ in 0..5 {
            mock.replies.lock().unwrap().push_back((500, "{}".to_owned()));
        }
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        let base = now_ms() + 1_000_000;
        assert_eq!(engine.step(base, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 999, &ignore).await, Step::Idle);
        assert_eq!(engine.step(base + 1_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 3_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 7_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 15_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 1_000_000, &ignore).await, Step::Idle);

        assert_eq!(mock.seen.lock().unwrap().len(), 5);
        let queue = engine.queue.lock().await;
        assert_eq!(queue.stored.jobs.len(), 1);
        assert_eq!(queue.stored.jobs[0].state, State::Failed);
        assert_eq!(queue.stored.jobs[0].attempts, 5);
    }

    #[tokio::test]
    async fn an_exhausted_job_is_marked_failed_while_the_next_job_still_runs() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back((500, "{}".to_owned()));
            replies.push_back((200, "{}".to_owned()));
            for _ in 0..4 {
                replies.push_back((500, "{}".to_owned()));
            }
        }
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine
            .enqueue(vec![add("L1", "v1", Some("PL1")), add("L1", "v2", Some("PL1"))])
            .await
            .expect("queued");

        let base = now_ms() + 1_000_000;
        assert_eq!(engine.step(base, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 1_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 3_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 7_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 15_000, &ignore).await, Step::Ran);
        assert_eq!(engine.step(base + 1_000_000, &ignore).await, Step::Idle);

        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 6);
        assert!(seen[1].body.contains("v2"));
        let queue = engine.queue.lock().await;
        assert_eq!(queue.stored.jobs.len(), 1);
        assert_eq!(queue.stored.jobs[0].video_id.as_deref(), Some("v1"));
        assert_eq!(queue.stored.jobs[0].state, State::Failed);
        assert_eq!(queue.stored.jobs[0].attempts, 5);
    }

    #[tokio::test]
    async fn a_forbidden_reply_without_the_quota_reason_does_not_switch_to_the_fallback() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            403,
            r#"{"error":{"message":"Forbidden","errors":[{"reason":"forbidden"}]}}"#.to_owned(),
        ));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);
        assert!(!engine.quota.lock().unwrap().fallback);
        let status = engine.status().await;
        assert_eq!(status.backend, "official");
        let queue = engine.queue.lock().await;
        assert_eq!(queue.stored.jobs[0].state, State::Pending);
        assert_eq!(queue.stored.jobs[0].attempts, 1);
    }

    #[tokio::test]
    async fn quota_error_switches_to_the_fallback_without_spending_an_attempt() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back((
                403,
                r#"{"error":{"message":"Quota exceeded","errors":[{"reason":"quotaExceeded"}]}}"#.to_owned(),
            ));
            replies.push_back((200, r#"{"access_token":"tv-access","expires_in":3600}"#.to_owned()));
            replies.push_back((200, "{}".to_owned()));
        }
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);
        {
            let queue = engine.queue.lock().await;
            assert_eq!(queue.stored.jobs[0].state, State::Pending);
            assert_eq!(queue.stored.jobs[0].attempts, 0);
        }
        assert!(engine.quota.lock().unwrap().fallback);

        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 3);
        assert!(seen[1].path.ends_with("/token"));
        assert!(seen[2].path.ends_with("/browse/edit_playlist"));
        assert!(seen[2].body.contains("ACTION_ADD_VIDEO"));
        let status = engine.status().await;
        assert_eq!(status.backend, "unofficial");
        assert_eq!(status.quota_used_today, QUOTA_LIMIT);
    }

    #[tokio::test]
    async fn unlimited_sync_sends_writes_to_innertube() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back((200, r#"{"access_token":"tv-access","expires_in":3600}"#.to_owned()));
            replies.push_back((200, "{}".to_owned()));
        }
        let dir = tempfile::tempdir().expect("temp dir");
        unlimited(dir.path(), true).await;
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 2);
        assert!(seen.iter().all(|request| !request.path.ends_with("/playlistItems")));
        assert!(seen[1].path.ends_with("/browse/edit_playlist"));
        assert_eq!(engine.status().await.backend, "unofficial");
    }

    #[tokio::test]
    async fn unlimited_sync_without_a_tv_token_pauses_with_the_connect_message() {
        let (base, mock) = start_mock().await;
        let dir = tempfile::tempdir().expect("temp dir");
        unlimited(dir.path(), true).await;
        let engine = engine_with(dir.path(), &base, None).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Halted(Halt::SignIn));
        let status = engine.status().await;
        assert_eq!(status.state, "paused_sign_in");
        assert_eq!(status.last_error.as_deref(), Some(MSG_CONNECT));
        assert!(mock.seen.lock().unwrap().is_empty());
        let queue = engine.queue.lock().await;
        assert_eq!(queue.stored.jobs[0].state, State::Pending);
        assert_eq!(queue.stored.jobs[0].attempts, 0);
    }

    #[tokio::test]
    async fn turning_unlimited_sync_off_returns_writes_to_the_official_api() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((200, "{}".to_owned()));
        let dir = tempfile::tempdir().expect("temp dir");
        unlimited(dir.path(), false).await;
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 1);
        assert!(seen[0].path.ends_with("/playlistItems"));
        assert_eq!(engine.status().await.backend, "official");
    }

    #[tokio::test]
    async fn a_created_playlist_is_linked_and_the_waiting_add_goes_to_it() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((200, r#"{"id":"PLnew"}"#.to_owned()));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine
            .enqueue(vec![create("L2", "Road trip"), add("L2", "v9", None)])
            .await
            .expect("queued");

        let linked = StdMutex::new(Vec::new());
        let emit = |event: Event| {
            if let Event::Linked { yt_playlist_id, .. } = event {
                linked.lock().unwrap().push(yt_playlist_id);
            }
        };
        let now = now_ms() + 1_000_000;
        assert_eq!(engine.step(now, &emit).await, Step::Ran);
        assert_eq!(engine.step(now + 1, &emit).await, Step::Ran);

        assert_eq!(linked.lock().unwrap().as_slice(), ["PLnew".to_owned()]);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 2);
        assert!(seen[1].path.ends_with("/playlistItems"));
        assert!(seen[1].body.contains("PLnew"));
        assert!(seen[1].body.contains("v9"));
    }

    #[tokio::test]
    async fn an_imported_playlist_takes_later_adds_without_a_second_create() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((200, "{}".to_owned()));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.link("L3", "PLimported").await.expect("linked");
        engine.enqueue(vec![add("L3", "v4", None)]).await.expect("queued");

        let now = now_ms() + 1_000_000;
        assert_eq!(engine.step(now, &|_: Event| {}).await, Step::Ran);

        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 1);
        assert!(seen[0].path.ends_with("/playlistItems"));
        assert!(seen[0].body.contains("PLimported"));
    }

    #[tokio::test]
    async fn unlinking_an_imported_playlist_drops_its_queued_writes_and_sends_nothing() {
        let (base, mock) = start_mock().await;
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.link("L6", "PLkeep").await.expect("linked");
        engine.enqueue(vec![add("L6", "v1", None)]).await.expect("queued");
        engine.unlink("L6").await.expect("unlinked");

        assert_eq!(engine.step(now_ms() + 1_000_000, &|_: Event| {}).await, Step::Idle);
        assert!(mock.seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn deleting_a_playlist_made_in_hushio_still_deletes_it_on_youtube() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((200, "{}".to_owned()));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.link("L7", "PLmade").await.expect("linked");
        engine
            .enqueue(vec![JobInput {
                kind: Kind::Delete,
                local_playlist_id: Some("L7".to_owned()),
                yt_playlist_id: None,
                video_id: None,
                payload: None,
            }])
            .await
            .expect("queued");

        assert_eq!(engine.step(now_ms() + 1_000_000, &|_: Event| {}).await, Step::Ran);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].method, "DELETE");
        assert!(seen[0].query.contains("PLmade"));
    }

    #[tokio::test]
    async fn an_over_quota_read_says_so_without_calling_youtube_again() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            403,
            r#"{"error":{"message":"Quota exceeded","errors":[{"reason":"quotaExceeded"}]}}"#.to_owned(),
        ));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        assert_eq!(engine.my_playlists().await.unwrap_err(), MSG_QUOTA);
        assert_eq!(engine.playlist_videos("PL1").await.unwrap_err(), MSG_QUOTA);
        assert_eq!(mock.seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_run_drains_the_queue_and_records_the_sync_time() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((200, r#"{"items":[]}"#.to_owned()));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine
            .enqueue(vec![rating(Kind::Like, "dQw4w9WgXcQ")])
            .await
            .expect("queued");

        engine.run(&ignore).await;

        let status = engine.status().await;
        assert_eq!(status.state, "idle");
        assert_eq!(status.failed_jobs, 0);
        assert!(status.last_synced_at.is_some());
        assert_eq!(status.pulled_playlists, 0);
        assert_eq!(mock.seen.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn a_like_and_an_unlike_are_sent_as_ratings_in_order() {
        let (base, mock) = start_mock().await;
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![rating(Kind::Like, "dQw4w9WgXcQ")]).await.expect("liked");
        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);
        engine.enqueue(vec![rating(Kind::Unlike, "dQw4w9WgXcQ")]).await.expect("unliked");
        assert_eq!(engine.step(now_ms(), &ignore).await, Step::Ran);

        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 2);
        assert!(seen.iter().all(|request| request.path.ends_with("/videos/rate")));
        assert!(seen[0].query.contains("rating=like"));
        assert!(seen[1].query.contains("rating=none"));
        assert!(engine.queue.lock().await.stored.jobs.is_empty());
    }

    #[test]
    fn a_like_cancels_a_pending_unlike_and_the_reverse() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut queue = Queue {
            root: dir.path().to_path_buf(),
            stored: Stored::default(),
        };
        queue.enqueue(rating(Kind::Like, "dQw4w9WgXcQ"), 0).expect("like");
        assert!(!queue.enqueue(rating(Kind::Unlike, "dQw4w9WgXcQ"), 1).expect("unlike"));
        assert!(queue.stored.jobs.is_empty());
        queue.enqueue(rating(Kind::Unlike, "dQw4w9WgXcQ"), 2).expect("unlike");
        assert_eq!(queue.stored.jobs.len(), 1);
        assert_eq!(queue.stored.jobs[0].kind, Kind::Unlike);
    }

    #[tokio::test]
    async fn a_rating_for_a_song_that_is_not_on_youtube_is_refused() {
        let (base, mock) = start_mock().await;
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        assert!(engine.enqueue(vec![rating(Kind::Like, "net:abcdefghij")]).await.is_err());
        assert!(engine.enqueue(vec![rating(Kind::Unlike, "local-1")]).await.is_err());
        assert!(engine.queue.lock().await.stored.jobs.is_empty());
        assert!(mock.seen.lock().unwrap().is_empty());
    }
}

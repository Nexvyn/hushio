use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::APP_NAME;
use crate::google_auth::TokenError;
use crate::persist;
use crate::yt_data_api::{AccessTokens, ApiError, QUOTA_LIMIT, Quota, RemoteItem, YtApi, now_ms};

pub const MAX_ATTEMPTS: u32 = 5;
const BACKOFF_MS: [i64; 4] = [1_000, 2_000, 4_000, 8_000];
const PACING: Duration = Duration::from_millis(250);
const OWNER: &str = "guest";
const QUEUE_FILE: &str = "sync-queue";
const QUOTA_FILE: &str = "yt-quota";

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
    Quota,
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
    quota: Arc<StdMutex<Quota>>,
    queue: Mutex<Queue>,
    run: StdMutex<Run>,
}

impl<T: AccessTokens> Engine<T> {
    pub async fn load(root: PathBuf, base: &str, tokens: T) -> Self {
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
            queue: Mutex::new(queue),
            run: StdMutex::new(Run::default()),
            root,
        }
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
            backend: "official",
            quota_used_today,
            quota_limit: QUOTA_LIMIT,
            failed_jobs,
            last_error: run.last_error.clone(),
            last_synced_at,
            pulled_playlists: run.pulled,
        }
    }

    pub async fn run(&self, emit: Emit<'_>) {
        if !self.begin().await {
            return;
        }
        self.drain(emit).await;
        self.end(emit).await;
    }

    async fn begin(&self) -> bool {
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
        match self.api.list_playlists(&self.tokens).await {
            Ok(list) => {
                self.run
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner())
                    .pulled = list.len();
            }
            Err(error) => {
                if let Some(halt) = halt_for(&error) {
                    self.halt(halt, now_ms());
                    self.report(emit).await;
                    return;
                }
                self.note_error(error.describe());
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
        self.run
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .playlist_name = match job.kind {
            Kind::Create | Kind::Rename => job.payload.clone(),
            _ => None,
        };

        let outcome = self.perform(&job).await;
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
            Err(error) => match halt_for(&error) {
                Some(halt) => {
                    queue.release(&job.id);
                    self.halt(halt, now);
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

    async fn perform(&self, job: &Job) -> Result<Option<String>, ApiError> {
        let tokens = &self.tokens;
        let playlist = job.yt_playlist_id.clone().unwrap_or_default();
        let video = job.video_id.clone().unwrap_or_default();
        let name = job.payload.clone().unwrap_or_default();
        match job.kind {
            Kind::Create => self.api.create_playlist(tokens, &name).await.map(Some),
            Kind::Rename => self
                .api
                .rename_playlist(tokens, &playlist, &name)
                .await
                .map(|()| None),
            Kind::Add => self
                .api
                .add_item(tokens, &playlist, &video)
                .await
                .map(|()| None),
            Kind::Remove => {
                let items: Vec<RemoteItem> = self.api.list_items(tokens, &playlist).await?;
                let Some(item) = items.iter().find(|item| item.video_id == video) else {
                    return Ok(None);
                };
                match self.api.remove_item(tokens, &item.item_id).await {
                    Err(error) if error.status() == Some(404) => Ok(None),
                    other => other.map(|()| None),
                }
            }
            Kind::Delete => self
                .api
                .delete_playlist(tokens, &playlist)
                .await
                .map(|()| None),
            Kind::Like => self.api.rate(tokens, &video, true).await.map(|()| None),
            Kind::Unlike => self.api.rate(tokens, &video, false).await.map(|()| None),
        }
    }

    fn halt(&self, halt: Halt, now: i64) {
        let mut run = self.run.lock().unwrap_or_else(|poison| poison.into_inner());
        run.halt = Some(halt);
        if halt == Halt::Quota {
            if let Ok(mut quota) = self.quota.lock() {
                quota.exhaust(now);
            }
            run.last_error = Some(
                "YouTube's daily API quota is used up. Sync resumes after midnight Pacific.".to_owned(),
            );
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
        error if error.is_quota() => Some(Halt::Quota),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::yt_data_api::test_support::{FakeTokens, start_mock};

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

    async fn engine(root: &Path, base: &str) -> Engine<FakeTokens> {
        Engine::load(root.to_path_buf(), base, FakeTokens).await
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
    async fn quota_error_pauses_the_run_without_spending_an_attempt() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            403,
            r#"{"error":{"message":"Quota exceeded","errors":[{"reason":"quotaExceeded"}]}}"#.to_owned(),
        ));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine.enqueue(vec![add("L1", "v1", Some("PL1"))]).await.expect("queued");

        let now = now_ms();
        assert_eq!(engine.step(now, &ignore).await, Step::Halted(Halt::Quota));
        let status = engine.status().await;
        assert_eq!(status.state, "error");
        assert_eq!(status.quota_used_today, QUOTA_LIMIT);
        let queue = engine.queue.lock().await;
        assert_eq!(queue.stored.jobs[0].state, State::Pending);
        assert_eq!(queue.stored.jobs[0].attempts, 0);
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
    async fn a_run_drains_the_queue_and_records_the_sync_time() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((200, r#"{"items":[]}"#.to_owned()));
        let dir = tempfile::tempdir().expect("temp dir");
        let engine = engine(dir.path(), &base).await;
        engine
            .enqueue(vec![JobInput { kind: Kind::Like, local_playlist_id: None, yt_playlist_id: None, video_id: Some("v3".to_owned()), payload: None }])
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
}

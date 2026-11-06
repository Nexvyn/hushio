use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const RELEASES_LATEST: &str = "https://github.com/Nexvyn/hushio/releases/latest";
const FIRST_CHECK: Duration = Duration::from_secs(20);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const CHECK_TIMEOUT: Duration = Duration::from_secs(15);
const TEST_VERSION_ENV: &str = "HUSHIO_UPDATE_TEST_VERSION";
const EVENT: &str = "updates:changed";
const DEV_ONLY: &str = "Updates are checked in the installed app.";
const NO_UPDATE: &str = "the release has no update for this app yet";
const NOTHING_TO_INSTALL: &str = "No update is ready to install.";
const DOWNLOAD_FAILED: &str = "The update couldn't download. Download it from hushio.space instead.";

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Idle,
    Checking,
    Current,
    Available,
    Downloading,
    Ready,
    Error,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Check,
    Install,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Route {
    InApp,
    Website,
    Releases,
    Flathub,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub status: Status,
    pub current: String,
    pub version: Option<String>,
    pub percent: Option<u8>,
    pub error: Option<String>,
    pub error_from: Option<Phase>,
    pub route: Route,
}

impl UpdateState {
    pub fn new(current: String, route: Route) -> Self {
        Self {
            status: Status::Idle,
            current,
            version: None,
            percent: None,
            error: None,
            error_from: None,
            route,
        }
    }

    pub fn begin_check(&mut self) -> bool {
        if !may_check(self.status) {
            return false;
        }
        self.status = Status::Checking;
        self.error = None;
        self.error_from = None;
        true
    }

    pub fn found(&mut self, version: Option<String>) {
        self.status = if version.is_some() {
            Status::Available
        } else {
            Status::Current
        };
        self.version = version;
        self.percent = None;
        self.error = None;
        self.error_from = None;
    }

    pub fn fail(&mut self, phase: Phase, message: String) {
        self.status = Status::Error;
        self.error = Some(message);
        self.error_from = Some(phase);
        self.percent = None;
    }

    pub fn begin_download(&mut self) -> bool {
        if self.status != Status::Available {
            return false;
        }
        self.status = Status::Downloading;
        self.percent = Some(0);
        self.error = None;
        self.error_from = None;
        true
    }

    pub fn progress(&mut self, percent: u8) {
        if self.status == Status::Downloading {
            self.percent = Some(percent);
        }
    }

    pub fn ready(&mut self) {
        self.status = Status::Ready;
        self.percent = None;
    }
}

pub struct Service {
    state: Mutex<UpdateState>,
    pending: Mutex<Option<Update>>,
}

impl Service {
    pub fn shared(current: String) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(UpdateState::new(current, detect_route())),
            pending: Mutex::new(None),
        })
    }

    fn snapshot(&self) -> UpdateState {
        self.state.lock().expect("updates state").clone()
    }

    fn change(&self, app: &AppHandle, apply: impl FnOnce(&mut UpdateState) -> bool) -> bool {
        let snapshot = {
            let mut state = self.state.lock().expect("updates state");
            if !apply(&mut state) {
                return false;
            }
            state.clone()
        };
        let _ = app.emit(EVENT, snapshot);
        true
    }

    fn set_pending(&self, update: Update) {
        *self.pending.lock().expect("updates pending") = Some(update);
    }

    fn take_pending(&self) -> Option<Update> {
        self.pending.lock().expect("updates pending").take()
    }
}

#[derive(Clone, Copy, Debug)]
enum Os {
    Windows,
    MacOs,
    Linux,
    Other,
}

fn current_os() -> Os {
    if cfg!(windows) {
        Os::Windows
    } else if cfg!(target_os = "macos") {
        Os::MacOs
    } else if cfg!(target_os = "linux") {
        Os::Linux
    } else {
        Os::Other
    }
}

fn packaged() -> bool {
    !cfg!(debug_assertions)
}

fn test_version() -> Option<String> {
    if packaged() {
        return None;
    }
    std::env::var(TEST_VERSION_ENV)
        .ok()
        .filter(|version| !version.trim().is_empty())
}

pub fn may_check(status: Status) -> bool {
    !matches!(status, Status::Checking | Status::Downloading | Status::Ready)
}

fn route_for(os: Os, packaged: bool, appimage_writable: Option<bool>, flatpak: bool) -> Route {
    if !packaged {
        return Route::Website;
    }
    match os {
        Os::Windows => Route::InApp,
        Os::Linux if flatpak => Route::Flathub,
        Os::Linux if appimage_writable == Some(true) => Route::InApp,
        Os::Linux => Route::Releases,
        Os::MacOs | Os::Other => Route::Website,
    }
}

fn detect_route() -> Route {
    let appimage = std::env::var_os("APPIMAGE").map(|path| writable(Path::new(&path)));
    route_for(
        current_os(),
        packaged(),
        appimage,
        std::env::var_os("FLATPAK_ID").is_some(),
    )
}

fn writable(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|meta| !meta.permissions().readonly())
        .unwrap_or(false)
}

pub fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let mut parts = text.strip_prefix('v').unwrap_or(text).split('.');
    let triple = (
        number(parts.next()?)?,
        number(parts.next()?)?,
        number(parts.next()?)?,
    );
    parts.next().is_none().then_some(triple)
}

fn number(part: &str) -> Option<u64> {
    if part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    part.parse().ok()
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    matches!(
        (parse_version(latest), parse_version(current)),
        (Some(latest), Some(current)) if latest > current
    )
}

pub fn tag_from_location(location: &str) -> Option<&str> {
    let (_, tail) = location.rsplit_once("/releases/tag/")?;
    let tag = tail.split(['?', '#']).next()?.trim_end_matches('/');
    (!tag.is_empty() && !tag.contains('/')).then_some(tag)
}

pub fn next_delay(checks_made: u32) -> Duration {
    if checks_made == 0 {
        FIRST_CHECK
    } else {
        CHECK_EVERY
    }
}

pub fn download_percent(done: u64, total: Option<u64>) -> u8 {
    match total {
        Some(total) if total > 0 => (done.min(total) * 100 / total).min(99) as u8,
        _ => 0,
    }
}

async fn newer_release(current: &str) -> Result<Option<String>, String> {
    if let Some(version) = test_version() {
        return Ok(is_newer(&version, current).then_some(version));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(|error| format!("Couldn't reach GitHub ({error})."))?;
    let response = client
        .get(RELEASES_LATEST)
        .header(reqwest::header::USER_AGENT, format!("Hushio/{current}"))
        .send()
        .await
        .map_err(|error| format!("Couldn't reach GitHub ({error})."))?;
    let status = response.status();
    if !status.is_redirection() {
        return Err(format!("GitHub answered {}", status.as_u16()));
    }
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    Ok(tag_from_location(location)
        .filter(|tag| is_newer(tag, current))
        .map(|tag| tag.trim_start_matches('v').to_owned()))
}

async fn offer(app: &AppHandle) -> Result<Update, String> {
    let updater = app.updater().map_err(|error| error.to_string())?;
    updater
        .check()
        .await
        .map_err(|error| format!("Couldn't reach GitHub ({error})."))?
        .ok_or_else(|| NO_UPDATE.to_owned())
}

pub async fn check(app: AppHandle, manual: bool) {
    let service = app.state::<Arc<Service>>().inner().clone();
    let snapshot = service.snapshot();
    if snapshot.route == Route::Flathub {
        return;
    }
    if !packaged() && test_version().is_none() {
        if manual {
            service.change(&app, |state| {
                state.fail(Phase::Check, DEV_ONLY.to_owned());
                true
            });
        }
        return;
    }
    if !service.change(&app, UpdateState::begin_check) {
        return;
    }
    let outcome = match newer_release(&snapshot.current).await {
        Ok(Some(version)) if snapshot.route == Route::InApp => {
            offer(&app).await.map(|update| {
                service.set_pending(update);
                Some(version)
            })
        }
        Ok(found) => Ok(found),
        Err(message) => Err(message),
    };
    match outcome {
        Ok(version) => {
            service.change(&app, |state| {
                state.found(version);
                true
            });
        }
        Err(message) => {
            service.change(&app, |state| {
                state.fail(Phase::Check, message);
                true
            });
        }
    }
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut checks_made = 0;
        loop {
            tokio::time::sleep(next_delay(checks_made)).await;
            checks_made += 1;
            check(app.clone(), false).await;
        }
    });
}

fn install(app: &AppHandle, service: &Arc<Service>) -> Result<(), String> {
    let update = service
        .take_pending()
        .ok_or_else(|| NOTHING_TO_INSTALL.to_owned())?;
    if !service.change(app, UpdateState::begin_download) {
        service.set_pending(update);
        return Err(NOTHING_TO_INSTALL.to_owned());
    }
    let app = app.clone();
    let service = service.clone();
    tauri::async_runtime::spawn(async move { run_install(app, service, update).await });
    Ok(())
}

async fn run_install(app: AppHandle, service: Arc<Service>, update: Update) {
    let mut downloaded: u64 = 0;
    let result = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let percent = download_percent(downloaded, total);
                service.change(&app, |state| {
                    state.progress(percent);
                    true
                });
            },
            || {},
        )
        .await;
    match result {
        Ok(()) => {
            service.change(&app, |state| {
                state.ready();
                true
            });
        }
        Err(error) => {
            tracing::warn!(%error, "update download failed");
            service.change(&app, |state| {
                state.fail(Phase::Install, DOWNLOAD_FAILED.to_owned());
                true
            });
        }
    }
}

#[tauri::command]
pub fn updates_state(service: State<'_, Arc<Service>>) -> UpdateState {
    service.snapshot()
}

#[tauri::command]
pub fn updates_check(app: AppHandle) {
    tauri::async_runtime::spawn(check(app, true));
}

#[tauri::command]
pub fn updates_install(app: AppHandle, service: State<'_, Arc<Service>>) -> Result<(), String> {
    install(&app, service.inner())
}

#[tauri::command]
pub fn updates_restart(app: AppHandle) {
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_follow_the_strict_rule() {
        assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("v10.0.7"), Some((10, 0, 7)));
        for text in ["1.2", "1.2.3.4", "1.2.3-beta", "v", "", "a.b.c", "1..3"] {
            assert_eq!(parse_version(text), None, "{text}");
        }
    }

    #[test]
    fn newer_compares_numbers_not_text() {
        assert!(is_newer("v1.10.0", "1.9.9"));
        assert!(is_newer("2.0.0", "1.99.99"));
        assert!(!is_newer("1.2.3", "1.2.3"));
        assert!(!is_newer("1.2.4-beta", "1.2.3"));
    }

    #[test]
    fn tag_comes_from_the_release_redirect() {
        let base = "https://github.com/Nexvyn/hushio/releases";
        assert_eq!(tag_from_location(&format!("{base}/tag/v1.2.0")), Some("v1.2.0"));
        assert_eq!(tag_from_location(&format!("{base}/tag/v1.2.0/?x=1")), Some("v1.2.0"));
        assert_eq!(tag_from_location(base), None);
    }

    #[test]
    fn checks_run_at_twenty_seconds_then_every_six_hours() {
        assert_eq!(next_delay(0), Duration::from_secs(20));
        assert_eq!(next_delay(1), Duration::from_secs(21_600));
        assert_eq!(next_delay(9), Duration::from_secs(21_600));
    }

    #[test]
    fn checks_wait_for_a_check_or_a_download_in_progress() {
        assert!(may_check(Status::Idle));
        assert!(may_check(Status::Available));
        assert!(may_check(Status::Error));
        assert!(!may_check(Status::Checking));
        assert!(!may_check(Status::Downloading));
        assert!(!may_check(Status::Ready));
    }

    #[test]
    fn route_depends_on_how_the_app_was_installed() {
        assert_eq!(route_for(Os::Windows, true, None, false), Route::InApp);
        assert_eq!(route_for(Os::MacOs, true, None, false), Route::Website);
        assert_eq!(route_for(Os::Linux, true, Some(true), false), Route::InApp);
        assert_eq!(route_for(Os::Linux, true, Some(false), false), Route::Releases);
        assert_eq!(route_for(Os::Linux, true, None, false), Route::Releases);
        assert_eq!(route_for(Os::Linux, true, Some(true), true), Route::Flathub);
        assert_eq!(route_for(Os::Windows, false, None, false), Route::Website);
    }

    #[test]
    fn download_percent_stops_at_99_until_done() {
        assert_eq!(download_percent(0, Some(100)), 0);
        assert_eq!(download_percent(50, Some(200)), 25);
        assert_eq!(download_percent(100, Some(100)), 99);
        assert_eq!(download_percent(40, None), 0);
    }

    #[test]
    fn state_moves_through_check_download_and_ready() {
        let mut state = UpdateState::new("1.1.1".into(), Route::InApp);
        assert!(state.begin_check());
        assert!(!state.begin_check());
        state.found(Some("1.2.0".into()));
        assert_eq!(state.status, Status::Available);
        assert!(state.begin_download());
        state.progress(42);
        assert_eq!(state.percent, Some(42));
        state.ready();
        assert_eq!(state.status, Status::Ready);
        assert_eq!(state.percent, None);
        assert!(!state.begin_check());
    }

    #[test]
    fn failures_keep_the_phase_for_the_copy() {
        let mut state = UpdateState::new("1.1.1".into(), Route::InApp);
        state.begin_check();
        state.fail(Phase::Check, "GitHub answered 404".into());
        assert_eq!(state.status, Status::Error);
        assert_eq!(state.error_from, Some(Phase::Check));
        assert!(state.begin_check());
        state.found(None);
        assert_eq!(state.status, Status::Current);
        assert_eq!(state.error, None);
    }

    #[test]
    fn download_needs_an_available_update() {
        let mut state = UpdateState::new("1.1.1".into(), Route::InApp);
        assert!(!state.begin_download());
    }
}

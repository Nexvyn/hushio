use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher as _};
use tauri::{AppHandle, Emitter, Manager};

use super::{is_known_audio, is_under_path, LocalFolderEntry, Service};
use crate::reveal::Folders;
use crate::tree_library;

pub const CHANGED_EVENT: &str = "local-library-changed";
const QUIET: Duration = Duration::from_secs(2);
const TICK: Duration = Duration::from_millis(250);
const TEMP_EXTENSIONS: [&str; 5] = ["part", "tmp", "temp", "crdownload", "partial"];

pub fn is_change(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_))
}

fn is_temp_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with('~')
        || lower.ends_with('~')
        || lower
            .rsplit_once('.')
            .is_some_and(|(_, ext)| TEMP_EXTENSIONS.contains(&ext))
}

pub fn is_relevant(root: &Path, path: &Path, kind: &EventKind) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return false;
    };
    if rel.as_os_str().is_empty() || rel.components().any(|part| part.as_os_str().to_string_lossy().starts_with('.')) {
        return false;
    }
    let Some(name) = path.file_name().map(|name| name.to_string_lossy().into_owned()) else {
        return false;
    };
    if is_temp_name(&name) {
        return false;
    }
    if is_known_audio(&name) {
        return true;
    }
    matches!(kind, EventKind::Create(_)) && path.extension().is_none()
}

pub struct Debouncer {
    quiet: Duration,
    pending: BTreeMap<String, Instant>,
}

impl Debouncer {
    pub fn new(quiet: Duration) -> Self {
        Self {
            quiet,
            pending: BTreeMap::new(),
        }
    }

    pub fn touch(&mut self, root: &str, now: Instant) {
        self.pending.insert(root.to_string(), now);
    }

    pub fn take_due(&mut self, now: Instant) -> Vec<String> {
        let due: Vec<String> = self
            .pending
            .iter()
            .filter(|(_, last)| now.saturating_duration_since(**last) >= self.quiet)
            .map(|(root, _)| root.clone())
            .collect();
        for root in &due {
            self.pending.remove(root);
        }
        due
    }
}

pub fn owning_root<'a>(roots: &'a BTreeSet<String>, path: &Path) -> Option<&'a str> {
    let text = path.to_string_lossy();
    roots
        .iter()
        .filter(|root| is_under_path(&text, root))
        .max_by_key(|root| root.len())
        .map(String::as_str)
}

pub fn wanted_roots(folders: &[LocalFolderEntry], approved: impl Fn(&Path) -> bool) -> BTreeSet<String> {
    folders
        .iter()
        .filter(|folder| !tree_library::is_tree_uri(&folder.path))
        .filter(|folder| {
            let path = Path::new(&folder.path);
            path.is_dir() && approved(path)
        })
        .map(|folder| folder.path.clone())
        .collect()
}

struct Shared {
    watcher: RecommendedWatcher,
    roots: BTreeSet<String>,
}

pub struct Watcher {
    shared: Arc<Mutex<Shared>>,
}

impl Watcher {
    fn start(app: AppHandle) -> notify::Result<Self> {
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
        let watcher = notify::recommended_watcher(move |event: notify::Result<Event>| {
            let _ = tx.send(event);
        })?;
        let shared = Arc::new(Mutex::new(Shared {
            watcher,
            roots: BTreeSet::new(),
        }));
        let pump_shared = shared.clone();
        thread::spawn(move || pump(&app, &rx, &pump_shared));
        Ok(Self { shared })
    }

    fn sync(&self, wanted: BTreeSet<String>) {
        let Ok(mut shared) = self.shared.lock() else {
            return;
        };
        let stale: Vec<String> = shared.roots.difference(&wanted).cloned().collect();
        for root in stale {
            let _ = shared.watcher.unwatch(Path::new(&root));
            shared.roots.remove(&root);
        }
        for root in wanted {
            if shared.roots.contains(&root) {
                continue;
            }
            match shared.watcher.watch(Path::new(&root), RecursiveMode::Recursive) {
                Ok(()) => {
                    shared.roots.insert(root);
                }
                Err(error) => tracing::warn!(%error, path = %root, "could not watch a local music folder"),
            }
        }
    }
}

fn pump(app: &AppHandle, rx: &mpsc::Receiver<notify::Result<Event>>, shared: &Mutex<Shared>) {
    let mut debouncer = Debouncer::new(QUIET);
    loop {
        match rx.recv_timeout(TICK) {
            Ok(Ok(event)) => record(shared, &mut debouncer, &event, Instant::now()),
            Ok(Err(error)) => {
                tracing::warn!(%error, "local music folder watch reported an error");
                prune_missing(shared);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        for root in debouncer.take_due(Instant::now()) {
            if !Path::new(&root).is_dir() {
                tracing::warn!(path = %root, "a watched local music folder is missing; watch stopped");
                prune_missing(shared);
            }
            if let Err(error) = app.emit(CHANGED_EVENT, &root) {
                tracing::warn!(%error, "could not announce a local library change");
            }
        }
    }
}

fn record(shared: &Mutex<Shared>, debouncer: &mut Debouncer, event: &Event, now: Instant) {
    if !is_change(&event.kind) {
        return;
    }
    let roots = match shared.lock() {
        Ok(guard) => guard.roots.clone(),
        Err(_) => return,
    };
    for path in &event.paths {
        let Some(root) = owning_root(&roots, path) else {
            continue;
        };
        if is_relevant(Path::new(root), path, &event.kind) {
            debouncer.touch(root, now);
        }
    }
}

fn prune_missing(shared: &Mutex<Shared>) {
    let Ok(mut shared) = shared.lock() else {
        return;
    };
    let gone: Vec<String> = shared
        .roots
        .iter()
        .filter(|root| !Path::new(root).is_dir())
        .cloned()
        .collect();
    for root in gone {
        let _ = shared.watcher.unwatch(Path::new(&root));
        shared.roots.remove(&root);
    }
}

pub fn start_watching(app: &AppHandle) {
    match Watcher::start(app.clone()) {
        Ok(watcher) => {
            app.manage(watcher);
            tauri::async_runtime::block_on(sync_watches(app));
        }
        Err(error) => tracing::warn!(%error, "local music folders will not refresh by themselves"),
    }
}

pub async fn sync_watches(app: &AppHandle) {
    let folders = app.state::<Service>().library().await.folders;
    let approvals = app.state::<Folders>();
    let wanted = wanted_roots(&folders, |path| approvals.check(path).is_ok());
    if let Some(watcher) = app.try_state::<Watcher>() {
        watcher.sync(wanted);
    }
}

#[cfg(test)]
mod tests;

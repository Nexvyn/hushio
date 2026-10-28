mod han;
mod matching;
mod parse;
mod providers;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::header::{ACCEPT, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tracing::info;

use crate::{APP_NAME, APP_SLUG};

const CACHE_CAP: usize = 400;
const MISS_TTL: Duration = Duration::from_secs(600);
const SWEEP_CEILING: Duration = Duration::from_secs(12);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsMeta {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: Option<f64>,
}

#[derive(Clone)]
pub struct Query {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: f64,
}

impl From<LyricsMeta> for Query {
    fn from(meta: LyricsMeta) -> Self {
        Self {
            id: meta.id,
            title: meta.title,
            artist: meta.artist,
            album: meta.album.filter(|album| !album.trim().is_empty()),
            duration: meta
                .duration
                .filter(|duration| duration.is_finite() && *duration > 0.0)
                .unwrap_or(0.0),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedLyricWord {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricBg {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<SyncedLyricWord>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedLyricLine {
    pub time: f64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<SyncedLyricWord>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bg: Option<LyricBg>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub roman: Option<String>,
}

#[cfg(test)]
impl SyncedLyricLine {
    fn at(time: f64, text: &str) -> Self {
        Self {
            time,
            text: text.to_owned(),
            end: None,
            words: None,
            bg: None,
            roman: None,
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub synced: Option<Vec<SyncedLyricLine>>,
    pub plain: Option<String>,
    pub source: String,
    pub word_synced: bool,
}

impl LyricsResult {
    fn has_lines(&self) -> bool {
        self.synced.as_ref().is_some_and(|lines| !lines.is_empty())
    }
}

#[derive(Clone)]
pub struct Hosts {
    pub boidu: String,
    pub lrclib: String,
    pub apple: String,
    pub amp: String,
    pub paxsenix: String,
    pub genius: String,
}

impl Default for Hosts {
    fn default() -> Self {
        Self {
            boidu: "https://lyrics-api.boidu.dev".to_owned(),
            lrclib: "https://lrclib.net/api".to_owned(),
            apple: "https://music.apple.com".to_owned(),
            amp: "https://amp-api.music.apple.com".to_owned(),
            paxsenix: "https://lyrics.paxsenix.org".to_owned(),
            genius: "https://genius.com".to_owned(),
        }
    }
}

#[derive(Clone, Copy)]
enum Source {
    BetterLyrics,
    Portato,
    PaxSenix,
    Lrclib,
    Genius,
}

const ORDER: [Source; 5] = [
    Source::BetterLyrics,
    Source::Portato,
    Source::PaxSenix,
    Source::Lrclib,
    Source::Genius,
];

impl Source {
    fn name(self) -> &'static str {
        match self {
            Source::BetterLyrics => "BetterLyrics",
            Source::Portato => "Portato",
            Source::PaxSenix => "PaxSenix",
            Source::Lrclib => "LRCLIB",
            Source::Genius => "Genius",
        }
    }

    fn lazy(self) -> bool {
        matches!(self, Source::Genius)
    }
}

struct Inner {
    http: reqwest::Client,
    hosts: Hosts,
    portato_gated: AtomicBool,
    apple_token: Mutex<Option<String>>,
}

struct Entry {
    at: Instant,
    result: Option<LyricsResult>,
}

fn is_fresh(entry: &Entry, now: Instant) -> bool {
    if entry
        .result
        .as_ref()
        .is_some_and(|result| result.word_synced && result.synced.is_some())
    {
        return true;
    }
    now.duration_since(entry.at) < MISS_TTL
}

pub struct Service {
    inner: Arc<Inner>,
    ceiling: Duration,
    cache: Mutex<HashMap<String, Entry>>,
}

impl Service {
    pub fn new() -> Result<Self, reqwest::Error> {
        Self::with_hosts(Hosts::default(), SWEEP_CEILING)
    }

    fn with_hosts(hosts: Hosts, ceiling: Duration) -> Result<Self, reqwest::Error> {
        let mut defaults = HeaderMap::new();
        defaults.insert(ACCEPT, HeaderValue::from_static("application/json"));
        let http = reqwest::Client::builder()
            .user_agent(format!("{APP_NAME} (https://github.com/{APP_SLUG}-music)"))
            .default_headers(defaults)
            .build()?;
        Ok(Self {
            inner: Arc::new(Inner {
                http,
                hosts,
                portato_gated: AtomicBool::new(false),
                apple_token: Mutex::new(None),
            }),
            ceiling,
            cache: Mutex::new(HashMap::new()),
        })
    }

    pub async fn get(&self, meta: LyricsMeta) -> Option<LyricsResult> {
        let query = Query::from(meta);
        if let Some(cached) = self.cached(&query.id) {
            return cached;
        }
        let result = self.sweep(&query).await;
        self.remember(&query.id, &result);
        result
    }

    fn cached(&self, id: &str) -> Option<Option<LyricsResult>> {
        let cache = self.cache.lock().expect("lyrics cache lock");
        cache
            .get(id)
            .filter(|entry| is_fresh(entry, Instant::now()))
            .map(|entry| entry.result.clone())
    }

    fn remember(&self, id: &str, result: &Option<LyricsResult>) {
        let mut cache = self.cache.lock().expect("lyrics cache lock");
        cache.insert(
            id.to_owned(),
            Entry {
                at: Instant::now(),
                result: result.clone(),
            },
        );
        while cache.len() > CACHE_CAP {
            let oldest = cache
                .iter()
                .min_by_key(|(_, entry)| entry.at)
                .map(|(key, _)| key.clone());
            match oldest {
                Some(key) => {
                    cache.remove(&key);
                }
                None => break,
            }
        }
    }

    async fn sweep(&self, query: &Query) -> Option<LyricsResult> {
        let mut jobs: Vec<Option<JoinHandle<Option<LyricsResult>>>> = ORDER
            .iter()
            .map(|&source| {
                (!source.lazy()).then(|| {
                    tokio::spawn(run(self.inner.clone(), source, query.clone()))
                })
            })
            .collect();
        let mut fallback: Option<LyricsResult> = None;
        for (index, source) in ORDER.into_iter().enumerate() {
            let found = match jobs[index].take() {
                Some(mut job) => match timeout(self.ceiling, &mut job).await {
                    Ok(joined) => joined.ok().flatten(),
                    Err(_) => {
                        job.abort();
                        info!("[lyrics] {}: still running at the deadline", source.name());
                        None
                    }
                },
                None if fallback.is_some() => continue,
                None => run(self.inner.clone(), source, query.clone()).await,
            };
            let Some(found) = found else {
                continue;
            };
            if found.has_lines() {
                abort_all(&jobs);
                info!("[lyrics] WINNER: {}", found.source);
                return Some(found);
            }
            fallback.get_or_insert(found);
        }
        match &fallback {
            Some(found) => info!("[lyrics] WINNER: {} (plain)", found.source),
            None => info!("[lyrics] WINNER: none"),
        }
        fallback
    }
}

fn abort_all(jobs: &[Option<JoinHandle<Option<LyricsResult>>>]) {
    for job in jobs.iter().flatten() {
        job.abort();
    }
}

async fn run(inner: Arc<Inner>, source: Source, query: Query) -> Option<LyricsResult> {
    let started = Instant::now();
    let found = match source {
        Source::BetterLyrics => providers::better_lyrics(&inner, &query).await,
        Source::Portato => providers::portato(&inner, &query).await,
        Source::PaxSenix => providers::pax_senix(&inner, &query).await,
        Source::Lrclib => providers::lrclib(&inner, &query).await,
        Source::Genius => providers::genius(&inner, &query).await,
    };
    let elapsed = started.elapsed().as_millis();
    match &found {
        Some(result) => {
            let last = result
                .synced
                .as_ref()
                .and_then(|lines| lines.last())
                .map_or(0.0, |line| line.time);
            info!(
                "[lyrics] {}: {} lines last={:.2} plain={} word={} in {}ms",
                source.name(),
                result.synced.as_ref().map_or(0, Vec::len),
                last,
                result.plain.is_some(),
                result.word_synced,
                elapsed
            );
        }
        None => info!("[lyrics] {}: no answer in {}ms", source.name(), elapsed),
    }
    found
}

#[cfg(test)]
pub(crate) mod test_support {
    use axum::Router;
    use tokio::net::TcpListener;

    pub async fn serve(build: impl FnOnce(&str) -> Router) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind local port");
        let base = format!("http://{}", listener.local_addr().expect("local address"));
        let router = build(&base);
        tokio::spawn(async move {
            axum::serve(listener, router).await.expect("serve local router");
        });
        base
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(age: Duration, result: Option<LyricsResult>) -> Entry {
        Entry {
            at: Instant::now().checked_sub(age).expect("instant in range"),
            result,
        }
    }

    fn timed(word_synced: bool) -> LyricsResult {
        LyricsResult {
            synced: Some(vec![SyncedLyricLine::at(1.0, "line")]),
            plain: None,
            source: "Test".to_owned(),
            word_synced,
        }
    }

    #[test]
    fn word_synced_results_stay_fresh_forever() {
        let old = Duration::from_secs(3600);
        assert!(is_fresh(&entry(old, Some(timed(true))), Instant::now()));
    }

    #[test]
    fn other_results_and_misses_expire_after_ten_minutes() {
        let now = Instant::now();
        assert!(is_fresh(&entry(Duration::from_secs(599), Some(timed(false))), now));
        assert!(!is_fresh(&entry(Duration::from_secs(601), Some(timed(false))), now));
        assert!(is_fresh(&entry(Duration::from_secs(60), None), now));
        assert!(!is_fresh(&entry(Duration::from_secs(601), None), now));
    }

    #[test]
    fn cache_keeps_at_most_400_entries_and_drops_the_oldest() {
        let service = Service::with_hosts(Hosts::default(), SWEEP_CEILING).expect("client");
        {
            let mut cache = service.cache.lock().expect("lock");
            for index in 0..CACHE_CAP {
                let age = Duration::from_secs((CACHE_CAP - index) as u64);
                cache.insert(format!("id{index}"), entry(age, None));
            }
        }
        service.remember("new", &None);
        let cache = service.cache.lock().expect("lock");
        assert_eq!(cache.len(), CACHE_CAP);
        assert!(!cache.contains_key("id0"));
        assert!(cache.contains_key("id1"));
        assert!(cache.contains_key("new"));
    }

    #[test]
    fn query_drops_non_positive_durations() {
        let meta = |duration| LyricsMeta {
            id: "x".to_owned(),
            title: "t".to_owned(),
            artist: "a".to_owned(),
            album: Some("  ".to_owned()),
            duration,
        };
        assert_eq!(Query::from(meta(Some(-3.0))).duration, 0.0);
        assert_eq!(Query::from(meta(Some(f64::NAN))).duration, 0.0);
        assert_eq!(Query::from(meta(Some(212.0))).duration, 212.0);
        assert!(Query::from(meta(None)).album.is_none());
    }

    #[test]
    fn only_genius_is_lazy_and_it_runs_last() {
        assert!(Source::Genius.lazy());
        assert!(ORDER.iter().filter(|source| source.lazy()).count() == 1);
        assert!(matches!(ORDER[ORDER.len() - 1], Source::Genius));
    }

    #[test]
    fn providers_run_in_prd_priority_order() {
        let names: Vec<&str> = ORDER.iter().map(|source| source.name()).collect();
        assert_eq!(names, ["BetterLyrics", "Portato", "PaxSenix", "LRCLIB", "Genius"]);
    }

    #[test]
    fn sweep_ceiling_is_twelve_seconds() {
        assert_eq!(SWEEP_CEILING, Duration::from_secs(12));
    }
}

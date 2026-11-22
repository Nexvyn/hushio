mod choice;
mod extra;
mod han;
mod matching;
mod parse;
mod providers;

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::header::{ACCEPT, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tokio::time::timeout;
use tracing::info;

pub use choice::LyricsCandidate;
use crate::{APP_NAME, APP_SLUG};

const CACHE_CAP: usize = 400;
const MISS_TTL: Duration = Duration::from_secs(600);
const SWEEP_CEILING: Duration = Duration::from_secs(12);
const MAX_LOCAL_LRC_BYTES: u64 = 1024 * 1024;
const SONG_END_SLACK: f64 = 15.0;
const EARLY_END_MIN_SONG: f64 = 90.0;
const EARLY_END_RATIO: f64 = 0.3;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsMeta {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: Option<f64>,
    #[serde(default)]
    pub providers: Option<Vec<String>>,
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

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncedLyricWord {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricBg {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub words: Option<Vec<SyncedLyricWord>>,
}

#[derive(Clone, Serialize, Deserialize)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation: Option<String>,
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
            translation: None,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResult {
    pub synced: Option<Vec<SyncedLyricLine>>,
    pub plain: Option<String>,
    pub source: String,
    pub word_synced: bool,
    #[serde(default)]
    pub custom: bool,
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
    pub kugou_search: String,
    pub kugou_lyrics: String,
    pub kugou_download: String,
    pub simpmusic: String,
    pub lyrics_plus: Vec<String>,
    pub unison: String,
    pub youtube_timedtext: String,
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
            kugou_search: "https://mobileservice.kugou.com/api/v3/search/song".to_owned(),
            kugou_lyrics: "https://lyrics.kugou.com/search".to_owned(),
            kugou_download: "https://lyrics.kugou.com/download".to_owned(),
            simpmusic: "https://api-lyrics.simpmusic.org".to_owned(),
            lyrics_plus: [
                "https://lyricsplus.prjktla.my.id",
                "https://lyricsplus.atomix.one",
                "https://lyricsplus.binimum.org",
            ]
            .map(str::to_owned)
            .to_vec(),
            unison: "https://unison.boidu.dev".to_owned(),
            youtube_timedtext: "https://www.youtube.com/api/timedtext".to_owned(),
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Source {
    BetterLyrics,
    Portato,
    PaxSenix,
    Lrclib,
    Genius,
    KuGou,
    SimpMusic,
    LyricsPlus,
    Unison,
    YouTubeCaptions,
}

const ORDER: [Source; 10] = [
    Source::BetterLyrics,
    Source::Portato,
    Source::PaxSenix,
    Source::Lrclib,
    Source::KuGou,
    Source::SimpMusic,
    Source::LyricsPlus,
    Source::Unison,
    Source::YouTubeCaptions,
    Source::Genius,
];

fn enabled_sources(enabled: Option<&[String]>) -> Vec<Source> {
    ORDER
        .into_iter()
        .filter(|source| match enabled {
            Some(list) => list.iter().any(|id| id == source.id()),
            None => true,
        })
        .collect()
}

#[cfg(test)]
const PROVIDER_IDS: [&str; 10] = [
    "betterLyrics",
    "portato",
    "paxsenix",
    "lrclib",
    "kugou",
    "simpmusic",
    "lyricsPlus",
    "unison",
    "youtubeCaptions",
    "genius",
];

impl Source {
    fn name(self) -> &'static str {
        match self {
            Source::BetterLyrics => "BetterLyrics",
            Source::Portato => "Portato",
            Source::PaxSenix => "PaxSenix",
            Source::Lrclib => "LRCLIB",
            Source::Genius => "Genius",
            Source::KuGou => "KuGou",
            Source::SimpMusic => "SimpMusic",
            Source::LyricsPlus => "LyricsPlus",
            Source::Unison => "Unison",
            Source::YouTubeCaptions => "YouTube captions",
        }
    }

    fn id(self) -> &'static str {
        match self {
            Source::BetterLyrics => "betterLyrics",
            Source::Portato => "portato",
            Source::PaxSenix => "paxsenix",
            Source::Lrclib => "lrclib",
            Source::Genius => "genius",
            Source::KuGou => "kugou",
            Source::SimpMusic => "simpmusic",
            Source::LyricsPlus => "lyricsPlus",
            Source::Unison => "unison",
            Source::YouTubeCaptions => "youtubeCaptions",
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
    overrides: Mutex<HashMap<String, LyricsResult>>,
    store: Option<PathBuf>,
    save_lock: tokio::sync::Mutex<()>,
}

impl Service {
    pub async fn load(root: PathBuf) -> Result<Self, reqwest::Error> {
        Self::open(Hosts::default(), SWEEP_CEILING, Some(root)).await
    }

    async fn open(hosts: Hosts, ceiling: Duration, store: Option<PathBuf>) -> Result<Self, reqwest::Error> {
        let overrides = match &store {
            Some(root) => choice::read_overrides(root).await,
            None => HashMap::new(),
        };
        let mut service = Self::with_hosts(hosts, ceiling)?;
        service.overrides = Mutex::new(overrides);
        service.store = store;
        Ok(service)
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
            overrides: Mutex::new(HashMap::new()),
            store: None,
            save_lock: tokio::sync::Mutex::new(()),
        })
    }

    pub async fn search(&self, query: &str, duration: Option<f64>) -> Result<Vec<LyricsCandidate>, String> {
        choice::search(&self.inner, query, duration).await
    }

    pub async fn pick(&self, song_id: &str, provider: &str, candidate_id: &str) -> Result<LyricsResult, String> {
        let result = choice::fetch_candidate(&self.inner, provider, candidate_id).await?;
        self.overrides
            .lock()
            .expect("lyrics override lock")
            .insert(song_id.to_owned(), result.clone());
        self.cache.lock().expect("lyrics cache lock").remove(song_id);
        self.save_overrides().await;
        Ok(LyricsResult { custom: true, ..result })
    }

    pub async fn reset(&self, song_id: &str) {
        self.overrides.lock().expect("lyrics override lock").remove(song_id);
        self.cache.lock().expect("lyrics cache lock").remove(song_id);
        self.save_overrides().await;
    }

    async fn save_overrides(&self) {
        let Some(root) = &self.store else {
            return;
        };
        let _guard = self.save_lock.lock().await;
        let snapshot = self.overrides.lock().expect("lyrics override lock").clone();
        if let Err(error) = choice::write_overrides(root, &snapshot).await {
            tracing::warn!("lyrics override save failed: {error}");
        }
    }

    fn chosen(&self, id: &str) -> Option<LyricsResult> {
        self.overrides
            .lock()
            .expect("lyrics override lock")
            .get(id)
            .map(|result| LyricsResult { custom: true, ..result.clone() })
    }

    #[cfg(test)]
    pub async fn get(&self, meta: LyricsMeta) -> Option<LyricsResult> {
        self.get_with_local_path(meta, None).await
    }

    pub async fn get_with_local_path(
        &self,
        meta: LyricsMeta,
        local_path: Option<&str>,
    ) -> Option<LyricsResult> {
        let enabled = meta.providers.clone();
        let query = Query::from(meta);
        if let Some(chosen) = self.chosen(&query.id) {
            return Some(chosen);
        }
        if let Some(local) = local_result(local_path).await {
            return Some(local);
        }
        if let Some(cached) = self.cached(&query.id) {
            return cached;
        }
        let result = self.sweep(&query, enabled.as_deref()).await;
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

    async fn sweep(&self, query: &Query, enabled: Option<&[String]>) -> Option<LyricsResult> {
        let sources = enabled_sources(enabled);
        let mut jobs: Vec<Option<JoinHandle<Option<LyricsResult>>>> = sources
            .iter()
            .map(|&source| {
                (!source.lazy()).then(|| {
                    tokio::spawn(run(self.inner.clone(), source, query.clone()))
                })
            })
            .collect();
        let mut fallback: Option<LyricsResult> = None;
        for (index, source) in sources.iter().enumerate() {
            if source.lazy() {
                continue;
            }
            let found = match jobs[index].take() {
                Some(mut job) => match timeout(self.ceiling, &mut job).await {
                    Ok(joined) => joined.ok().flatten(),
                    Err(_) => {
                        job.abort();
                        info!("[lyrics] {}: still running at the deadline", source.name());
                        None
                    }
                },
                None => None,
            };
            let Some(found) = found else {
                continue;
            };
            if found.has_lines() {
                if !fits_duration(&found, query.duration) {
                    log_misfit(*source, &found, query.duration);
                    continue;
                }
                abort_all(&jobs);
                info!("[lyrics] WINNER: {}", found.source);
                return Some(found);
            }
            fallback.get_or_insert(found);
        }
        for (index, source) in sources.iter().enumerate() {
            if !source.lazy() {
                continue;
            }
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
                None => run(self.inner.clone(), *source, query.clone()).await,
            };
            let Some(found) = found else {
                continue;
            };
            if found.has_lines() {
                if !fits_duration(&found, query.duration) {
                    log_misfit(*source, &found, query.duration);
                    continue;
                }
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

fn fits_duration(result: &LyricsResult, duration: f64) -> bool {
    let last = match result.synced.as_ref().and_then(|lines| lines.last()) {
        Some(line) if duration > 0.0 => line.time,
        _ => return true,
    };
    if last > duration + SONG_END_SLACK {
        return false;
    }
    !(duration >= EARLY_END_MIN_SONG && last < duration * EARLY_END_RATIO)
}

fn log_misfit(source: Source, result: &LyricsResult, duration: f64) {
    let last = result
        .synced
        .as_ref()
        .and_then(|lines| lines.last())
        .map_or(0.0, |line| line.time);
    info!(
        "[lyrics] {}: skipped, last line {:.2}s does not fit a {:.2}s song",
        source.name(),
        last,
        duration
    );
}

async fn local_result(path: Option<&str>) -> Option<LyricsResult> {
    let path = path?.to_owned();
    let text = tokio::task::spawn_blocking(move || {
        read_local_lrc(&path).or_else(|| read_embedded_lyrics(&path))
    })
        .await
        .ok()
        .flatten()?;
    match parse::parse_provider_any(&text)? {
        parse::Parsed::Timed(lines) => parse::timed_result("Local file", lines),
        parse::Parsed::Plain(text) => Some(parse::plain_result("Local file", text)),
    }
}

#[cfg(target_os = "android")]
fn read_local_lrc(audio_path: &str) -> Option<String> {
    if audio_path.starts_with("content://") {
        crate::android::read_sidecar_lrc(audio_path)
    } else {
        read_file_lrc(audio_path)
    }
}

#[cfg(not(target_os = "android"))]
fn read_local_lrc(audio_path: &str) -> Option<String> {
    read_file_lrc(audio_path)
}

fn read_file_lrc(audio_path: &str) -> Option<String> {
    let audio = Path::new(audio_path);
    let parent = audio.parent()?;
    let stem = audio.file_stem()?.to_string_lossy();
    let sidecar = fs::read_dir(parent)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.extension()
                .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("lrc"))
                && path.file_stem().is_some_and(|candidate| {
                    candidate.to_string_lossy().eq_ignore_ascii_case(&stem)
                })
        })?;
    let mut bytes = Vec::new();
    fs::File::open(sidecar)
        .ok()?
        .take(MAX_LOCAL_LRC_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() as u64 <= MAX_LOCAL_LRC_BYTES)
        .then(|| String::from_utf8(bytes).ok())
        .flatten()
}

#[cfg(not(target_os = "android"))]
fn read_embedded_lyrics(audio_path: &str) -> Option<String> {
    use lofty::file::TaggedFileExt;
    use lofty::id3::v2::{FrameFlags, SynchronizedTextFrame};
    use lofty::tag::{ItemKey, ItemValue, TagType};

    let tagged = lofty::read_from_path(audio_path).ok()?;
    let tag = tagged.tag(TagType::Id3v2)
        .or_else(|| tagged.primary_tag())
        .or_else(|| tagged.first_tag())?;

    if let Some(plain) = tag.get_string(&ItemKey::Lyrics).filter(|text| !text.trim().is_empty()) {
        return (plain.len() <= MAX_LOCAL_LRC_BYTES as usize).then(|| plain.to_owned());
    }

    let bytes = tag.items().find_map(|item| {
        matches!(item.key(), ItemKey::Unknown(key) if key == "SYLT")
            .then(|| match item.value() {
                ItemValue::Binary(bytes) if bytes.len() <= MAX_LOCAL_LRC_BYTES as usize => Some(bytes.as_slice()),
                _ => None,
            })
            .flatten()
    })?;
    let frame = SynchronizedTextFrame::parse(bytes, FrameFlags::default()).ok()?;
    sylt_to_lrc(frame.timestamp_format, &frame.content)
}

#[cfg(not(target_os = "android"))]
fn sylt_to_lrc(
    timestamp_format: lofty::id3::v2::TimestampFormat,
    content: &[(u32, String)],
) -> Option<String> {
    use lofty::id3::v2::TimestampFormat;

    if timestamp_format != TimestampFormat::MS {
        return None;
    }
    let text = content.iter().filter_map(|(milliseconds, line)| {
        let line = line.trim();
        if line.is_empty() { return None; }
        let minutes = milliseconds / 60_000;
        let seconds = milliseconds % 60_000;
        Some(format!("[{minutes:02}:{:02}.{:02}]{line}", seconds / 1000, (seconds % 1000) / 10))
    }).collect::<Vec<_>>().join("\n");
    (!text.is_empty()).then_some(text)
}

#[cfg(target_os = "android")]
fn read_embedded_lyrics(_audio_path: &str) -> Option<String> {
    None
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
        Source::KuGou => extra::ku_gou(&inner, &query).await,
        Source::SimpMusic => extra::simp_music(&inner, &query).await,
        Source::LyricsPlus => extra::lyrics_plus(&inner, &query).await,
        Source::Unison => extra::unison(&inner, &query).await,
        Source::YouTubeCaptions => extra::youtube_captions(&inner, &query).await,
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

    use super::Hosts;

    pub fn local_hosts(base: &str) -> Hosts {
        Hosts {
            boidu: base.to_owned(),
            lrclib: format!("{base}/api"),
            apple: base.to_owned(),
            amp: base.to_owned(),
            paxsenix: base.to_owned(),
            genius: base.to_owned(),
            kugou_search: format!("{base}/kugou/search"),
            kugou_lyrics: format!("{base}/kugou/lyrics"),
            kugou_download: format!("{base}/kugou/download"),
            simpmusic: base.to_owned(),
            lyrics_plus: vec![base.to_owned()],
            unison: base.to_owned(),
            youtube_timedtext: format!("{base}/timedtext"),
        }
    }

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
    use axum::Router;
    use axum::routing::get;
    use std::sync::atomic::Ordering;

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
            custom: false,
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

    #[cfg(not(target_os = "android"))]
    #[test]
    fn embedded_sylt_milliseconds_are_converted_to_lrc_timestamps() {
        use lofty::id3::v2::TimestampFormat;

        let content = vec![(65_430, " First line ".to_owned()), (121_000, "Second line".to_owned())];
        assert_eq!(
            sylt_to_lrc(TimestampFormat::MS, &content).as_deref(),
            Some("[01:05.43]First line\n[02:01.00]Second line"),
        );
        assert!(sylt_to_lrc(TimestampFormat::MPEG, &content).is_none());
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
            providers: None,
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
        assert_eq!(
            names,
            [
                "BetterLyrics",
                "Portato",
                "PaxSenix",
                "LRCLIB",
                "KuGou",
                "SimpMusic",
                "LyricsPlus",
                "Unison",
                "YouTube captions",
                "Genius",
            ]
        );
    }

    #[test]
    fn every_provider_has_a_settings_id() {
        let ids: Vec<&str> = ORDER.iter().map(|source| source.id()).collect();
        assert_eq!(ids, PROVIDER_IDS.to_vec());
        assert_eq!(ids.len(), ids.iter().collect::<std::collections::HashSet<_>>().len());
    }

    #[test]
    fn a_disabled_provider_is_left_out_of_the_sweep() {
        let enabled = vec!["lrclib".to_owned()];
        assert_eq!(enabled_sources(Some(enabled.as_slice())), vec![Source::Lrclib]);
    }

    #[test]
    fn unknown_provider_ids_are_ignored() {
        let enabled = vec!["nope".to_owned(), "genius".to_owned()];
        assert_eq!(enabled_sources(Some(enabled.as_slice())), vec![Source::Genius]);
    }

    #[test]
    fn enabled_sources_follow_order_not_the_enabled_list() {
        let enabled = vec!["genius".to_owned(), "lrclib".to_owned(), "betterLyrics".to_owned()];
        assert_eq!(
            enabled_sources(Some(enabled.as_slice())),
            vec![Source::BetterLyrics, Source::Lrclib, Source::Genius]
        );
    }

    #[test]
    fn empty_enabled_list_gives_no_sources() {
        let none: Vec<String> = Vec::new();
        assert!(enabled_sources(Some(none.as_slice())).is_empty());
    }

    #[test]
    fn no_enabled_list_keeps_every_source_in_order() {
        assert_eq!(enabled_sources(None), ORDER.to_vec());
    }

    #[test]
    fn sweep_ceiling_is_twelve_seconds() {
        assert_eq!(SWEEP_CEILING, Duration::from_secs(12));
    }

    fn synced_ending_at(last: f64) -> LyricsResult {
        LyricsResult {
            synced: Some(vec![SyncedLyricLine::at(1.0, "first"), SyncedLyricLine::at(last, "last")]),
            plain: None,
            source: "Test".to_owned(),
            word_synced: false,
            custom: false,
        }
    }

    #[test]
    fn fits_duration_accepts_lyrics_that_end_within_the_song() {
        assert!(fits_duration(&synced_ending_at(195.0), 200.0));
    }

    #[test]
    fn fits_duration_rejects_lyrics_running_past_the_end_by_more_than_fifteen_seconds() {
        assert!(!fits_duration(&synced_ending_at(216.0), 200.0));
    }

    #[test]
    fn fits_duration_accepts_lyrics_exactly_fifteen_seconds_past_the_end() {
        assert!(fits_duration(&synced_ending_at(215.0), 200.0));
    }

    #[test]
    fn fits_duration_rejects_lyrics_stopping_before_thirty_percent_of_a_long_song() {
        assert!(!fits_duration(&synced_ending_at(58.0), 200.0));
    }

    #[test]
    fn fits_duration_accepts_lyrics_stopping_after_thirty_percent_of_a_long_song() {
        assert!(fits_duration(&synced_ending_at(62.0), 200.0));
    }

    #[test]
    fn fits_duration_never_rejects_an_early_end_on_a_short_song() {
        assert!(fits_duration(&synced_ending_at(5.0), 60.0));
    }

    #[test]
    fn fits_duration_accepts_everything_when_the_duration_is_unknown() {
        assert!(fits_duration(&synced_ending_at(900.0), 0.0));
        assert!(fits_duration(&synced_ending_at(1.0), 0.0));
    }

    #[test]
    fn fits_duration_accepts_plain_text_results() {
        let plain = LyricsResult {
            synced: None,
            plain: Some("a long story\nthat is not timed".to_owned()),
            source: "Test".to_owned(),
            word_synced: false,
            custom: false,
        };
        assert!(fits_duration(&plain, 200.0));
    }

    const CHOSEN_RECORD: &str = r#"{"id":7,"trackName":"Song","artistName":"Singer","duration":200,"syncedLyrics":"[00:01.00]chosen one\n[00:02.00]chosen two\n[00:03.00]chosen three"}"#;
    const AUTOMATIC_RECORD: &str = r#"{"id":3,"trackName":"Song","artistName":"Singer","duration":200,"syncedLyrics":"[00:01.00]auto one\n[00:02.00]auto two\n[03:00.00]auto three"}"#;

    fn meta(id: &str) -> LyricsMeta {
        LyricsMeta {
            id: id.to_owned(),
            title: "Song".to_owned(),
            artist: "Singer".to_owned(),
            album: None,
            duration: Some(200.0),
            providers: None,
        }
    }

    async fn local_service(base: &str, root: &std::path::Path) -> Service {
        Service::open(test_support::local_hosts(base), SWEEP_CEILING, Some(root.to_path_buf()))
            .await
            .expect("client")
    }

    #[tokio::test]
    async fn chosen_lyrics_are_returned_before_the_sweep_and_survive_a_restart() {
        let root = tempfile::tempdir().expect("temp dir");
        let search_hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let search_gate = search_hits.clone();
        let base = test_support::serve(move |_| {
            Router::new()
                .route("/api/get/7", get(|| async { CHOSEN_RECORD }))
                .route(
                    "/api/search",
                    get(move || {
                        search_gate.fetch_add(1, Ordering::SeqCst);
                        async { "[]" }
                    }),
                )
                .route("/api/get", get(|| async { AUTOMATIC_RECORD }))
        })
        .await;
        let service = local_service(&base, root.path()).await;
        let picked = service.pick("song-1", "lrclib", "7").await.expect("pick");
        assert!(picked.custom);
        let shown = service.get(meta("song-1")).await.expect("chosen lyrics");
        assert!(shown.custom);
        assert_eq!(shown.synced.expect("synced")[0].text, "chosen one");
        assert_eq!(search_hits.load(Ordering::SeqCst), 0);

        let restarted = local_service(&base, root.path()).await;
        let kept = restarted.get(meta("song-1")).await.expect("kept after restart");
        assert!(kept.custom);
        assert_eq!(kept.synced.expect("synced")[0].text, "chosen one");
        assert_eq!(search_hits.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn reset_removes_the_chosen_lyrics_and_the_automatic_answer_returns() {
        let root = tempfile::tempdir().expect("temp dir");
        let base = test_support::serve(|_| {
            Router::new()
                .route("/api/get/7", get(|| async { CHOSEN_RECORD }))
                .route("/api/get", get(|| async { AUTOMATIC_RECORD }))
                .route("/api/search", get(|| async { "[]" }))
        })
        .await;
        let service = local_service(&base, root.path()).await;
        service.pick("song-1", "lrclib", "7").await.expect("pick");
        assert!(service.get(meta("song-1")).await.expect("chosen").custom);

        service.reset("song-1").await;
        let automatic = service.get(meta("song-1")).await.expect("automatic");
        assert!(!automatic.custom);
        assert_eq!(automatic.synced.expect("synced")[0].text, "auto one");

        let restarted = local_service(&base, root.path()).await;
        assert!(!restarted.get(meta("song-1")).await.expect("automatic").custom);
    }

    #[tokio::test]
    async fn local_lrc_precedes_providers_and_keeps_word_timing() {
        let root = tempfile::tempdir().expect("temp dir");
        let audio = root.path().join("Song.mp3");
        std::fs::write(
            root.path().join("Song.lrc"),
            "[00:01.20]<00:01.20>hel<00:01.55>lo\n[00:02.00]world",
        )
        .expect("write LRC");
        let provider_hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let provider_gate = provider_hits.clone();
        let base = test_support::serve(move |_| {
            Router::new().route(
                "/api/get",
                get(move || {
                    provider_gate.fetch_add(1, Ordering::SeqCst);
                    async { AUTOMATIC_RECORD }
                }),
            )
        })
        .await;
        let service = Service::with_hosts(test_support::local_hosts(&base), SWEEP_CEILING).expect("client");

        let result = service
            .get_with_local_path(meta("local:song"), Some(audio.to_string_lossy().as_ref()))
            .await
            .expect("local lyrics");

        assert_eq!(result.source, "Local file");
        assert_eq!(provider_hits.load(Ordering::SeqCst), 0);
        let lines = result.synced.expect("timed lyrics");
        assert_eq!(lines[0].time, 1.2);
        assert_eq!(lines[0].text, "hello");
        let words = lines[0].words.as_ref().expect("word timings");
        assert_eq!(words.iter().map(|word| word.text.as_str()).collect::<Vec<_>>(), ["hel", "lo"]);
        assert_eq!((words[0].start, words[0].end), (1.2, 1.55));
    }

    #[tokio::test]
    async fn missing_local_lrc_falls_back_to_online_lyrics() {
        let root = tempfile::tempdir().expect("temp dir");
        let audio = root.path().join("Song.mp3");
        let base = test_support::serve(|_| Router::new().route("/api/get", get(|| async { AUTOMATIC_RECORD }))).await;
        let service = Service::with_hosts(test_support::local_hosts(&base), SWEEP_CEILING).expect("client");

        let result = service
            .get_with_local_path(meta("local:song"), Some(audio.to_string_lossy().as_ref()))
            .await
            .expect("online lyrics");

        assert_eq!(result.source, "LRCLIB");
    }

    const MISFIT_RECORD: &str = r#"{"trackName":"Song","artistName":"Singer","duration":200,"syncedLyrics":"[00:01.00]far\n[01:00.00]far\n[02:30.00]far\n[03:50.00]far"}"#;
    const FITTING_SIMPMUSIC: &str = r#"{"data":[{"songTitle":"Song","artistName":"Singer","durationSeconds":200,"syncedLyrics":"[00:01.00]good one\n[00:50.00]good two\n[01:40.00]good three\n[03:10.00]good four"}]}"#;

    #[tokio::test]
    async fn sweep_skips_synced_lyrics_that_run_past_the_song_and_takes_the_next_source() {
        let base = test_support::serve(|_| {
            Router::new()
                .route("/api/get", get(|| async { MISFIT_RECORD }))
                .route("/v1/song-1", get(|| async { FITTING_SIMPMUSIC }))
        })
        .await;
        let service = Service::with_hosts(test_support::local_hosts(&base), SWEEP_CEILING).expect("client");
        let enabled = vec!["lrclib".to_owned(), "simpmusic".to_owned()];

        let found = service
            .sweep(&Query::from(meta("song-1")), Some(enabled.as_slice()))
            .await
            .expect("fitting lyrics");

        assert_eq!(found.synced.expect("synced")[0].text, "good one");
    }

    #[tokio::test]
    async fn sweep_returns_nothing_when_every_synced_result_misfits() {
        let base = test_support::serve(|_| Router::new().route("/api/get", get(|| async { MISFIT_RECORD })))
            .await;
        let service = Service::with_hosts(test_support::local_hosts(&base), SWEEP_CEILING).expect("client");
        let enabled = vec!["lrclib".to_owned(), "simpmusic".to_owned()];

        let found = service.sweep(&Query::from(meta("song-1")), Some(enabled.as_slice())).await;

        assert!(found.is_none());
    }
}

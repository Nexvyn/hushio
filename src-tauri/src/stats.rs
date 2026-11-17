use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use chrono::{DateTime, Datelike, Local, Timelike};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::Notify;
use tokio::time::Duration;

use crate::persist;

const OWNER: &str = "guest";
const STATS_KEY: &str = "listening-history";
const JOURNAL_KEY: &str = "journal";
const VERSION: u64 = 1;
const FLUSH_EVERY: Duration = Duration::from_secs(5);
const PLAY_FLOOR_MS: u64 = 30_000;
const PLAY_CEILING_MS: u64 = 240_000;
const KEEP_MONTHS: i32 = 36;
const MAX_TRACKS: usize = 600;
const MAX_NAMES: usize = 400;
const SUMMARY_LIMIT: usize = 50;
const JOURNAL_MAX: usize = 600;
const JOURNAL_KEEP_MS: u64 = 60 * 86_400_000;
const UNKNOWN_ARTIST: &str = "Unknown artist";

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrackInput {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub artist: String,
    #[serde(default)]
    pub thumb: Option<String>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub episode: bool,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEvent {
    #[serde(rename = "type")]
    pub kind: String,
    pub track: Option<TrackInput>,
    #[serde(default)]
    pub delta_ms: f64,
    #[serde(default = "history_on")]
    pub history: bool,
}

fn history_on() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackStat {
    pub title: String,
    pub artist: String,
    pub thumb: Option<String>,
    pub ms: u64,
    pub plays: u64,
    pub last_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct NameStat {
    pub name: String,
    pub ms: u64,
    pub plays: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MonthBucket {
    pub month: String,
    #[serde(default)]
    pub tracks: BTreeMap<String, TrackStat>,
    #[serde(default)]
    pub artists: BTreeMap<String, NameStat>,
    #[serde(default = "empty_hours")]
    pub hours: Vec<u64>,
    #[serde(default)]
    pub days: BTreeMap<String, u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct JournalTrack {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub thumb: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct JournalEntry {
    pub track: JournalTrack,
    pub at: u64,
    pub heard: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct JournalKey {
    pub at: u64,
    pub id: String,
}

pub fn remove_journal_entries(entries: &mut Vec<JournalEntry>, keys: &[JournalKey]) -> usize {
    let before = entries.len();
    entries.retain(|entry| !keys.iter().any(|key| key.at == entry.at && key.id == entry.track.id));
    before - entries.len()
}

#[derive(Default)]
struct Rules {
    ms: HashMap<String, u64>,
    counted: HashSet<String>,
}

struct Session {
    track: TrackInput,
    heard_ms: u64,
}

#[derive(Default)]
struct State {
    buckets: Vec<MonthBucket>,
    journal: Vec<JournalEntry>,
    rules: Rules,
    session: Option<Session>,
    summaries: HashMap<String, Value>,
    dirty: bool,
    scheduled: bool,
}

pub struct Service {
    root: PathBuf,
    state: Mutex<State>,
    wake: Notify,
}

fn empty_hours() -> Vec<u64> {
    vec![0; 24]
}

fn empty_bucket(month: &str) -> MonthBucket {
    MonthBucket {
        month: month.to_string(),
        tracks: BTreeMap::new(),
        artists: BTreeMap::new(),
        hours: empty_hours(),
        days: BTreeMap::new(),
    }
}

fn is_month(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 7 && bytes[4] == b'-' && bytes.iter().enumerate().all(|(i, b)| i == 4 || b.is_ascii_digit())
}

fn month_key(at: &DateTime<Local>) -> String {
    format!("{:04}-{:02}", at.year(), at.month())
}

fn day_key(at: &DateTime<Local>) -> String {
    format!("{:04}-{:02}-{:02}", at.year(), at.month(), at.day())
}

fn millis(at: &DateTime<Local>) -> u64 {
    at.timestamp_millis().max(0) as u64
}

fn threshold_ms(duration: Option<f64>) -> u64 {
    let duration_ms = match duration {
        Some(seconds) if seconds > 0.0 => seconds * 1000.0,
        _ => PLAY_FLOOR_MS as f64,
    };
    (duration_ms / 2.0).max(PLAY_FLOOR_MS as f64).min(PLAY_CEILING_MS as f64) as u64
}

fn cutoff_month(now: &DateTime<Local>) -> String {
    let total = now.year() * 12 + now.month0() as i32 - KEEP_MONTHS;
    format!("{:04}-{:02}", total.div_euclid(12), total.rem_euclid(12) + 1)
}

fn previous_month(now: &DateTime<Local>) -> String {
    let total = now.year() * 12 + now.month0() as i32 - 1;
    format!("{:04}-{:02}", total.div_euclid(12), total.rem_euclid(12) + 1)
}

fn cap_map<T>(map: &mut BTreeMap<String, T>, max: usize, ms: impl Fn(&T) -> u64) {
    if map.len() <= max {
        return;
    }
    let mut order: Vec<(u64, String)> = map.iter().map(|(key, value)| (ms(value), key.clone())).collect();
    order.sort();
    for (_, key) in order.into_iter().take(map.len() - max) {
        map.remove(&key);
    }
}

fn cap_bucket(bucket: &mut MonthBucket) {
    cap_map(&mut bucket.tracks, MAX_TRACKS, |stat| stat.ms);
    cap_map(&mut bucket.artists, MAX_NAMES, |stat| stat.ms);
}

fn prune(buckets: &mut Vec<MonthBucket>, now: &DateTime<Local>) {
    let cutoff = cutoff_month(now);
    buckets.retain(|bucket| bucket.month >= cutoff);
    buckets.iter_mut().for_each(cap_bucket);
}

fn bucket_for<'a>(buckets: &'a mut Vec<MonthBucket>, month: &str) -> &'a mut MonthBucket {
    let index = match buckets.iter().position(|bucket| bucket.month == month) {
        Some(index) => index,
        None => {
            buckets.push(empty_bucket(month));
            buckets.sort_by(|a, b| a.month.cmp(&b.month));
            buckets.iter().position(|bucket| bucket.month == month).unwrap_or(0)
        }
    };
    &mut buckets[index]
}

fn record(state: &mut State, track: &TrackInput, listened: u64, at: DateTime<Local>) {
    let State { buckets, rules, .. } = state;
    let bucket = bucket_for(buckets, &month_key(&at));
    let artist_name = if track.artist.is_empty() { UNKNOWN_ARTIST.to_string() } else { track.artist.clone() };
    let artist_key = artist_name.to_lowercase();

    let stat = bucket.tracks.entry(track.id.clone()).or_insert_with(|| TrackStat {
        title: track.title.clone(),
        artist: track.artist.clone(),
        thumb: track.thumb.clone(),
        ..TrackStat::default()
    });
    stat.title = track.title.clone();
    stat.artist = track.artist.clone();
    if track.thumb.is_some() {
        stat.thumb = track.thumb.clone();
    }
    stat.ms += listened;
    stat.last_at = millis(&at);

    let artist = bucket.artists.entry(artist_key).or_default();
    artist.name = artist_name;
    artist.ms += listened;

    bucket.hours[at.hour() as usize] += listened;
    *bucket.days.entry(day_key(&at)).or_insert(0) += listened;

    let heard = rules.ms.entry(track.id.clone()).or_insert(0);
    *heard += listened;
    if !rules.counted.contains(&track.id) && *heard >= threshold_ms(track.duration) {
        rules.counted.insert(track.id.clone());
        stat.plays += 1;
        artist.plays += 1;
    }

    cap_bucket(bucket);
}

fn journal_add(entries: &mut Vec<JournalEntry>, track: &TrackInput, heard_ms: u64, at: &DateTime<Local>) {
    if track.id.is_empty() || track.episode || heard_ms == 0 {
        return;
    }
    let now = millis(at);
    entries.retain(|entry| now.saturating_sub(entry.at) <= JOURNAL_KEEP_MS);
    entries.push(JournalEntry {
        track: JournalTrack {
            id: track.id.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            thumb: track.thumb.clone(),
        },
        at: now,
        heard: (heard_ms + 500) / 1000,
    });
    let overflow = entries.len().saturating_sub(JOURNAL_MAX);
    entries.drain(..overflow);
}

fn close_session(state: &mut State, at: &DateTime<Local>) {
    if let Some(session) = state.session.take() {
        journal_add(&mut state.journal, &session.track, session.heard_ms, at);
    }
}

fn coerce_bucket(value: &Value) -> Option<MonthBucket> {
    let mut bucket: MonthBucket = serde_json::from_value(value.clone()).ok()?;
    if !is_month(&bucket.month) {
        return None;
    }
    if bucket.hours.len() != 24 {
        bucket.hours = empty_hours();
    }
    bucket.days.retain(|day, _| day.len() == 10 && is_month(&day[..7]) && day.as_bytes()[7] == b'-');
    Some(bucket)
}

fn coerce_buckets(values: &[Value]) -> Vec<MonthBucket> {
    let mut by_month: BTreeMap<String, MonthBucket> = BTreeMap::new();
    for bucket in values.iter().filter_map(coerce_bucket) {
        by_month.insert(bucket.month.clone(), bucket);
    }
    by_month.into_values().collect()
}

fn stored_array<'a>(stored: &'a Value, pointer: &str) -> &'a [Value] {
    stored.pointer(pointer).and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[])
}

fn stored_journal(stored: &Value) -> Vec<JournalEntry> {
    let entries: Vec<JournalEntry> = stored_array(stored, "/state/entries")
        .iter()
        .filter_map(|value| serde_json::from_value(value.clone()).ok())
        .collect();
    let overflow = entries.len().saturating_sub(JOURNAL_MAX);
    entries.into_iter().skip(overflow).collect()
}

#[derive(Default, Clone)]
struct TrackAgg {
    ms: u64,
    plays: u64,
    last_at: u64,
    title: String,
    artist: String,
    thumb: Option<String>,
}

#[derive(Default)]
struct NameAgg {
    name: String,
    ms: u64,
    plays: u64,
}

fn summary_months(period: &str, now: &DateTime<Local>, buckets: &[MonthBucket]) -> Vec<String> {
    let current = month_key(now);
    match period {
        "lastMonth" => vec![previous_month(now)],
        "year" => buckets
            .iter()
            .map(|bucket| bucket.month.clone())
            .filter(|month| month.starts_with(&format!("{:04}-", now.year())) && *month <= current)
            .collect(),
        "all" => buckets.iter().map(|bucket| bucket.month.clone()).collect(),
        _ => vec![current],
    }
}

fn summarize(buckets: &[MonthBucket], period: &str, now: &DateTime<Local>) -> Value {
    let period = match period {
        "lastMonth" | "year" | "all" => period,
        _ => "month",
    };
    let months = summary_months(period, now, buckets);
    let selected: Vec<&MonthBucket> = buckets.iter().filter(|bucket| months.contains(&bucket.month)).collect();

    let mut tracks: HashMap<String, TrackAgg> = HashMap::new();
    let mut artists: BTreeMap<String, NameAgg> = BTreeMap::new();
    let mut hours = vec![0u64; 24];
    let mut days: BTreeMap<String, u64> = BTreeMap::new();
    for bucket in &selected {
        for (id, stat) in &bucket.tracks {
            let agg = tracks.entry(id.clone()).or_default();
            agg.ms += stat.ms;
            agg.plays += stat.plays;
            if stat.last_at >= agg.last_at {
                agg.last_at = stat.last_at;
                agg.title = stat.title.clone();
                agg.artist = stat.artist.clone();
                agg.thumb = stat.thumb.clone();
            }
        }
        for (key, stat) in &bucket.artists {
            let agg = artists.entry(key.clone()).or_default();
            agg.name = stat.name.clone();
            agg.ms += stat.ms;
            agg.plays += stat.plays;
        }
        for (slot, ms) in hours.iter_mut().zip(&bucket.hours) {
            *slot += ms;
        }
        for (day, ms) in &bucket.days {
            *days.entry(day.clone()).or_insert(0) += ms;
        }
    }

    let total_ms: u64 = tracks.values().map(|agg| agg.ms).sum();
    let total_plays: u64 = tracks.values().map(|agg| agg.plays).sum();
    let mut track_rows: Vec<(String, TrackAgg)> = tracks.into_iter().collect();
    track_rows.sort_by(|a, b| b.1.ms.cmp(&a.1.ms).then_with(|| a.0.cmp(&b.0)));
    let track_count = track_rows.len();
    let track_json: Vec<Value> = track_rows
        .into_iter()
        .take(SUMMARY_LIMIT)
        .map(|(id, agg)| json!({ "id": id, "title": agg.title, "artist": agg.artist, "thumb": agg.thumb, "ms": agg.ms, "plays": agg.plays }))
        .collect();

    let mut artist_rows: Vec<(String, NameAgg)> = artists
        .into_iter()
        .filter(|(key, _)| key != &UNKNOWN_ARTIST.to_lowercase())
        .collect();
    let artist_count = artist_rows.len();
    artist_rows.sort_by(|a, b| b.1.ms.cmp(&a.1.ms).then_with(|| a.0.cmp(&b.0)));
    let artist_json: Vec<Value> = artist_rows
        .into_iter()
        .take(SUMMARY_LIMIT)
        .map(|(key, agg)| json!({ "key": key, "name": agg.name, "ms": agg.ms, "plays": agg.plays }))
        .collect();

    let day_json: Vec<Value> = days.into_iter().map(|(date, ms)| json!({ "date": date, "ms": ms })).collect();

    json!({
        "period": period,
        "months": months,
        "totalMs": total_ms,
        "plays": total_plays,
        "tracks": track_json,
        "artists": artist_json,
        "albums": [],
        "hours": hours,
        "days": day_json,
        "counts": { "tracks": track_count, "artists": artist_count, "albums": 0 },
    })
}

impl Service {
    pub async fn load(root: PathBuf) -> Self {
        let buckets = match persist::read(&root, OWNER, STATS_KEY).await {
            Some(stored) => coerce_buckets(stored_array(&stored, "/state/buckets")),
            None => Vec::new(),
        };
        let journal = match persist::read(&root, OWNER, JOURNAL_KEY).await {
            Some(stored) => stored_journal(&stored),
            None => Vec::new(),
        };
        Self {
            root,
            state: Mutex::new(State { buckets, journal, ..State::default() }),
            wake: Notify::new(),
        }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|poison| poison.into_inner())
    }

    fn touch(&self, state: &mut State) {
        state.summaries.clear();
        state.dirty = true;
        if !state.scheduled {
            state.scheduled = true;
            self.wake.notify_one();
        }
    }

    pub fn playback(&self, event: &PlaybackEvent, at: DateTime<Local>) -> Result<(), String> {
        if !event.history {
            return Ok(());
        }
        match event.kind.as_str() {
            "start" => {
                self.start(event.track.as_ref(), &at);
                Ok(())
            }
            "progress" | "pause" | "stop" => {
                if let Some(track) = &event.track {
                    self.listened(track, event.delta_ms, &at, event.kind == "stop");
                }
                Ok(())
            }
            "resume" => Ok(()),
            other => Err(format!("unknown playback event: {other}")),
        }
    }

    fn start(&self, track: Option<&TrackInput>, at: &DateTime<Local>) {
        let mut state = self.lock();
        close_session(&mut state, at);
        if let Some(track) = track.filter(|track| !track.id.is_empty() && !track.episode) {
            state.rules.ms.remove(&track.id);
            state.rules.counted.remove(&track.id);
            state.session = Some(Session { track: track.clone(), heard_ms: 0 });
        }
        self.touch(&mut state);
    }

    fn listened(&self, track: &TrackInput, delta_ms: f64, at: &DateTime<Local>, stop: bool) {
        if track.id.is_empty() || track.episode {
            return;
        }
        let mut state = self.lock();
        let listened = delta_ms.round().max(0.0) as u64;
        let same = state.session.as_ref().is_some_and(|session| session.track.id == track.id);
        if !same {
            close_session(&mut state, at);
            state.session = Some(Session { track: track.clone(), heard_ms: 0 });
        }
        if listened > 0 {
            record(&mut state, track, listened, *at);
            if let Some(session) = state.session.as_mut() {
                session.heard_ms += listened;
            }
            self.touch(&mut state);
        }
        if stop {
            close_session(&mut state, at);
        }
    }

    pub fn replay_summary(&self, period: &str, now: DateTime<Local>) -> Value {
        let mut state = self.lock();
        let key = format!("{period}|{}", month_key(&now));
        if let Some(cached) = state.summaries.get(&key) {
            return cached.clone();
        }
        let summary = summarize(&state.buckets, period, &now);
        state.summaries.insert(key, summary.clone());
        summary
    }

    pub fn export(&self) -> Vec<Value> {
        self.lock().buckets.iter().filter_map(|bucket| serde_json::to_value(bucket).ok()).collect()
    }

    pub fn journal(&self) -> Vec<JournalEntry> {
        self.lock().journal.clone()
    }

    pub async fn journal_remove(&self, keys: &[JournalKey]) -> Result<usize, String> {
        let removed = {
            let mut state = self.lock();
            let removed = remove_journal_entries(&mut state.journal, keys);
            if removed > 0 {
                state.dirty = true;
            }
            removed
        };
        self.write_pending().await?;
        Ok(removed)
    }

    pub async fn import(&self, buckets: &[Value]) -> Result<(), String> {
        {
            let mut state = self.lock();
            state.buckets = coerce_buckets(buckets);
            prune(&mut state.buckets, &Local::now());
            state.rules = Rules::default();
            state.summaries.clear();
            state.dirty = true;
        }
        self.write_pending().await
    }

    async fn write_pending(&self) -> Result<(), String> {
        let (buckets, journal) = {
            let mut state = self.lock();
            state.scheduled = false;
            if !state.dirty {
                return Ok(());
            }
            prune(&mut state.buckets, &Local::now());
            state.dirty = false;
            (state.buckets.clone(), state.journal.clone())
        };
        let written = async {
            persist::write(&self.root, OWNER, STATS_KEY, &json!({ "state": { "buckets": buckets }, "version": VERSION })).await?;
            persist::write(&self.root, OWNER, JOURNAL_KEY, &json!({ "state": { "entries": journal }, "version": VERSION })).await
        }
        .await;
        if written.is_err() {
            let mut state = self.lock();
            state.dirty = true;
            state.scheduled = true;
            self.wake.notify_one();
        }
        written
    }

    pub fn erase(&self) {
        *self.lock() = State::default();
    }

    pub async fn flush(&self) {
        if let Err(error) = self.write_pending().await {
            tracing::warn!("stats flush failed: {error}");
        }
    }

    pub async fn run_flush(self: std::sync::Arc<Self>) {
        loop {
            self.wake.notified().await;
            tokio::time::sleep(FLUSH_EVERY).await;
            self.flush().await;
        }
    }
}

#[cfg(test)]
mod tests;

use std::sync::LazyLock;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;

use super::matching::{clean_title, query_title, search_title};
use super::parse::{parse_lrc, parse_ttml, plain_result, timed_result, without_opening};
use super::{Inner, LyricsResult, Query, SyncedLyricLine, SyncedLyricWord};
use crate::APP_NAME;

const KUGOU_TIMEOUT: Duration = Duration::from_millis(7000);
const SIMPMUSIC_TIMEOUT: Duration = Duration::from_millis(7000);
const LYRICS_PLUS_TIMEOUT: Duration = Duration::from_millis(6000);
const UNISON_TIMEOUT: Duration = Duration::from_millis(7000);
const YOUTUBE_CAPTION_TIMEOUT: Duration = Duration::from_millis(7000);
const SAME_TRACK_SECONDS: f64 = 8.0;

static WORD_STAMP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\|(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>")
        .expect("word stamp regex")
});
static CREDIT_LINE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[^:：]{1,40}[:：]\s*\S").expect("credit regex"));

fn stamp(minutes: &str, seconds: &str, fraction: Option<&str>) -> f64 {
    let minutes: f64 = minutes.parse().unwrap_or(0.0);
    let seconds: f64 = seconds.parse().unwrap_or(0.0);
    let fraction = fraction.map_or(0.0, |text| {
        let value: f64 = text.parse().unwrap_or(0.0);
        value / 10f64.powi(text.len() as i32)
    });
    minutes * 60.0 + seconds + fraction
}

fn word_stamps(line: &str) -> Vec<(f64, f64)> {
    WORD_STAMP
        .captures_iter(line)
        .map(|caps| {
            let start = stamp(&caps[1], &caps[2], caps.get(3).map(|m| m.as_str()));
            let end = stamp(&caps[4], &caps[5], caps.get(6).map(|m| m.as_str()));
            (start, end)
        })
        .collect()
}

fn rich_sync_lines(text: &str) -> Vec<SyncedLyricLine> {
    let mut lines = Vec::new();
    for raw in text.lines() {
        let Some((head, rest)) = raw.split_once('[') else {
            continue;
        };
        let Some((minutes, seconds)) = head.split_once(':') else {
            continue;
        };
        let line_start = stamp(minutes, seconds, None);
        let stamps = word_stamps(rest);
        if stamps.is_empty() {
            continue;
        }
        let mut words: Vec<SyncedLyricWord> = Vec::new();
        for chunk in rest.split('>').skip(1) {
            let word = chunk.split('<').next().unwrap_or("").trim();
            if word.is_empty() {
                continue;
            }
            let index = words.len();
            let (start, end) = stamps.get(index).copied().unwrap_or((line_start, line_start + 0.4));
            words.push(SyncedLyricWord {
                start,
                end,
                text: word.to_owned(),
            });
        }
        if words.is_empty() {
            continue;
        }
        let line_text = words
            .iter()
            .map(|word| word.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");
        lines.push(SyncedLyricLine {
            time: line_start,
            text: line_text,
            end: words.last().map(|word| word.end),
            words: Some(words),
            bg: None,
            roman: None,
            translation: None,
        });
    }
    lines.sort_by(|a, b| a.time.total_cmp(&b.time));
    lines
}

async fn get_text(inner: &Inner, url: &str, headers: &[(&str, &str)], limit: Duration) -> Option<String> {
    let mut request = inner.http.get(url).timeout(limit);
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    match request.send().await {
        Ok(response) if response.status().is_success() => response.text().await.ok(),
        _ => None,
    }
}

async fn get_json<T: for<'de> Deserialize<'de>>(
    inner: &Inner,
    url: &str,
    headers: &[(&str, &str)],
    limit: Duration,
) -> Option<T> {
    let body = get_text(inner, url, headers, limit).await?;
    serde_json::from_str(&body).ok()
}

fn with_params(base: &str, params: &[(&str, String)]) -> String {
    reqwest::Url::parse_with_params(base, params)
        .expect("lyric host url")
        .to_string()
}

#[derive(Deserialize)]
struct KugouCandidate {
    id: String,
    accesskey: String,
}

#[derive(Deserialize)]
struct KugouSearch {
    #[serde(default)]
    candidates: Vec<KugouCandidate>,
}

#[derive(Deserialize)]
struct KugouDownload {
    content: String,
}

async fn kugou_lyrics(inner: &Inner, hash: &str, duration_ms: u64) -> Option<String> {
    let url = with_params(
        &inner.hosts.kugou_lyrics,
        &[
            ("ver", "1".to_owned()),
            ("man", "yes".to_owned()),
            ("client", "pc".to_owned()),
            ("hash", hash.to_owned()),
            ("duration", duration_ms.to_string()),
        ],
    );
    let body = get_text(inner, &url, &[], KUGOU_TIMEOUT).await?;
    let search: KugouSearch = serde_json::from_str(&body).ok()?;
    let candidate = search.candidates.into_iter().next()?;
    let url = with_params(
        &inner.hosts.kugou_download,
        &[
            ("fmt", "lrc".to_owned()),
            ("charset", "utf8".to_owned()),
            ("client", "pc".to_owned()),
            ("ver", "1".to_owned()),
            ("id", candidate.id),
            ("accesskey", candidate.accesskey),
        ],
    );
    let body = get_text(inner, &url, &[], KUGOU_TIMEOUT).await?;
    let download: KugouDownload = serde_json::from_str(&body).ok()?;
    STANDARD
        .decode(download.content)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

pub async fn ku_gou(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let keyword = format!(
        "{} - {} {}",
        search_title(&query.title),
        query.artist,
        query.album.as_deref().map(clean_title).unwrap_or_default()
    )
    .trim()
    .to_owned();
    let url = with_params(
        &inner.hosts.kugou_search,
        &[
            ("version", "9108".to_owned()),
            ("plat", "0".to_owned()),
            ("pagesize", "8".to_owned()),
            ("showtype", "0".to_owned()),
            ("keyword", keyword),
        ],
    );
    let body = get_text(inner, &url, &[], KUGOU_TIMEOUT).await?;
    let value: Value = serde_json::from_str(&body).ok()?;
    let songs = value.get("data")?.get("info")?.as_array()?.clone();
    for song in songs.iter().take(3) {
        let Some(hash) = song.get("hash").and_then(Value::as_str) else {
            continue;
        };
        let duration_ms = song.get("duration").and_then(Value::as_u64).unwrap_or(0);
        if duration_ms > 0 && query.duration > 0.0 {
            let gap = (duration_ms as f64 / 1000.0 - query.duration).abs();
            if gap > SAME_TRACK_SECONDS {
                continue;
            }
        }
        let Some(lrc) = kugou_lyrics(inner, hash, duration_ms).await else {
            continue;
        };
        let lines = parse_lrc(&lrc);
        if lines.is_empty() {
            continue;
        }
        if let Some(result) = timed_result("KuGou", without_opening(lines)) {
            return Some(result);
        }
    }
    None
}

#[derive(Deserialize)]
struct SimpMusicEntry {
    #[serde(rename = "songTitle", default)]
    song_title: String,
    #[serde(rename = "artistName", default)]
    artist_name: String,
    #[serde(rename = "durationSeconds", default)]
    duration_seconds: f64,
    #[serde(rename = "syncedLyrics", default)]
    synced_lyrics: String,
    #[serde(rename = "plainLyric", default)]
    plain_lyric: String,
    #[serde(rename = "richSyncLyrics", default)]
    rich_sync_lyrics: String,
}

#[derive(Deserialize)]
struct SimpMusicAnswer {
    #[serde(default)]
    data: Vec<SimpMusicEntry>,
}

pub async fn simp_music(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let url = format!("{}/v1/{}", inner.hosts.simpmusic, query.id);
    let answer: SimpMusicAnswer = get_json(inner, &url, &[], SIMPMUSIC_TIMEOUT).await?;
    let entry = answer
        .data
        .iter()
        .filter(|entry| {
            entry.song_title.eq_ignore_ascii_case(&query.title)
                || entry.artist_name.eq_ignore_ascii_case(&query.artist)
        })
        .min_by(|a, b| {
            (a.duration_seconds - query.duration)
                .abs()
                .total_cmp(&(b.duration_seconds - query.duration).abs())
        })
        .or_else(|| answer.data.first())?;
    if query.duration > 0.0 && (entry.duration_seconds - query.duration).abs() > SAME_TRACK_SECONDS {
        return None;
    }
    for source in [&entry.rich_sync_lyrics, &entry.synced_lyrics] {
        if source.trim().is_empty() {
            continue;
        }
        let rich = rich_sync_lines(source);
        if !rich.is_empty() {
            if let Some(result) = timed_result("SimpMusic", without_opening(rich)) {
                return Some(result);
            }
        }
        let lines = parse_lrc(source);
        if lines.is_empty() {
            continue;
        }
        if let Some(result) = timed_result("SimpMusic", without_opening(lines)) {
            return Some(result);
        }
    }
    if !entry.plain_lyric.trim().is_empty() {
        return Some(plain_result("SimpMusic", entry.plain_lyric.trim().to_owned()));
    }
    None
}

#[derive(Deserialize)]
struct LyricsPlusWord {
    text: String,
    time: f64,
    #[serde(default)]
    duration: f64,
}

#[derive(Deserialize)]
struct LyricsPlusLine {
    text: String,
    time: f64,
    #[serde(default)]
    duration: f64,
    #[serde(default)]
    syllabus: Vec<LyricsPlusWord>,
}

#[derive(Deserialize)]
struct LyricsPlusAnswer {
    #[serde(rename = "syncedLyrics", default)]
    synced_lyrics: String,
    #[serde(rename = "plainLyrics", default)]
    plain_lyrics: String,
    #[serde(default)]
    lyrics: Vec<LyricsPlusLine>,
}

fn lyrics_plus_lines(lines: Vec<LyricsPlusLine>) -> Vec<SyncedLyricLine> {
    lines
        .into_iter()
        .filter(|line| !line.text.trim().is_empty())
        .map(|line| {
            let start = line.time / 1000.0;
            let end = if line.duration > 0.0 {
                Some((line.time + line.duration) / 1000.0)
            } else {
                None
            };
            let has_words = !line.syllabus.is_empty();
            let words: Vec<SyncedLyricWord> = line
                .syllabus
                .into_iter()
                .filter(|word| !word.text.trim().is_empty())
                .map(|word| {
                    let word_start = word.time / 1000.0;
                    let word_end = if word.duration > 0.0 {
                        word_start + word.duration / 1000.0
                    } else {
                        word_start + 0.4
                    };
                    SyncedLyricWord {
                        start: word_start,
                        end: word_end,
                        text: word.text.trim().to_owned(),
                    }
                })
                .collect();
            SyncedLyricLine {
                time: start,
                text: line.text.trim().to_owned(),
                end,
                words: has_words.then_some(words),
                bg: None,
                roman: None,
                translation: None,
            }
        })
        .collect()
}

pub async fn lyrics_plus(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let mut params = vec![
        ("title", query_title(&query.title)),
        ("artist", query.artist.clone()),
        ("duration", query.duration.round().to_string()),
        ("id", query.id.clone()),
    ];
    if let Some(album) = query.album.as_deref() {
        let album = clean_title(album);
        if !album.is_empty() {
            params.push(("album", album));
        }
    }
    for mirror in &inner.hosts.lyrics_plus {
        let url = with_params(&format!("{mirror}/v2/lyrics/get"), &params);
        let Some(answer) = get_json::<LyricsPlusAnswer>(inner, &url, &[], LYRICS_PLUS_TIMEOUT).await
        else {
            continue;
        };
        if !answer.lyrics.is_empty() {
            let lines = lyrics_plus_lines(answer.lyrics);
            if let Some(result) = timed_result("LyricsPlus", without_opening(lines)) {
                return Some(result);
            }
        }
        if !answer.synced_lyrics.trim().is_empty() {
            let lines = parse_lrc(&answer.synced_lyrics);
            if let Some(result) = timed_result("LyricsPlus", without_opening(lines)) {
                return Some(result);
            }
        }
        if !answer.plain_lyrics.trim().is_empty() {
            return Some(plain_result("LyricsPlus", answer.plain_lyrics.trim().to_owned()));
        }
    }
    None
}

#[derive(Deserialize)]
struct UnisonEntry {
    #[serde(default)]
    lyrics: String,
    #[serde(default)]
    format: String,
    #[serde(rename = "syncType", default)]
    sync_type: String,
}

#[derive(Deserialize)]
struct UnisonAnswer {
    #[serde(default)]
    success: bool,
    data: UnisonEntry,
}

pub async fn unison(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let mut params = vec![
        ("v", query.id.clone()),
        ("song", query_title(&query.title)),
        ("artist", query.artist.clone()),
    ];
    if let Some(album) = query.album.as_deref() {
        let album = clean_title(album);
        if !album.is_empty() {
            params.push(("album", album));
        }
    }
    if query.duration > 0.0 {
        params.push(("duration", query.duration.round().to_string()));
    }
    let url = with_params(&format!("{}/lyrics", inner.hosts.unison), &params);
    let Some(answer) = get_json::<UnisonAnswer>(inner, &url, &[], UNISON_TIMEOUT).await else {
        return None;
    };
    if !answer.success {
        return None;
    }
    let entry = answer.data;
    if entry.lyrics.trim().is_empty() {
        return None;
    }
    if entry.format.eq_ignore_ascii_case("ttml") {
        let lines = parse_ttml(&entry.lyrics);
        if let Some(result) = timed_result("Unison", without_opening(lines)) {
            return Some(result);
        }
    }
    if entry.sync_type.eq_ignore_ascii_case("plain") {
        let text: Vec<&str> = entry
            .lyrics
            .lines()
            .filter(|line| !line.trim().is_empty() && !CREDIT_LINE.is_match(line.trim()))
            .collect();
        let joined = text.join("\n");
        if !joined.trim().is_empty() {
            return Some(plain_result("Unison", joined));
        }
        return None;
    }
    let lines = parse_lrc(&entry.lyrics);
    timed_result("Unison", without_opening(lines))
}

#[derive(Deserialize)]
struct CaptionSegment {
    #[serde(rename = "utf8", default)]
    text: String,
}

#[derive(Deserialize)]
struct CaptionEvent {
    #[serde(rename = "tStartMs", default)]
    start_ms: f64,
    #[serde(rename = "dDurationMs", default)]
    duration_ms: f64,
    #[serde(default)]
    segs: Vec<CaptionSegment>,
}

#[derive(Deserialize)]
struct CaptionAnswer {
    #[serde(default)]
    events: Vec<CaptionEvent>,
}

pub async fn youtube_captions(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    if query.id.len() < 8 {
        return None;
    }
    for language in ["en", "en-US", "en-GB", ""] {
        let mut params = vec![
            ("v", query.id.clone()),
            ("fmt", "json3".to_owned()),
            ("kind", "asr".to_owned()),
        ];
        if !language.is_empty() {
            params.push(("lang", language.to_owned()));
        }
        let url = with_params(&inner.hosts.youtube_timedtext, &params);
        let Some(body) = get_text(
            inner,
            &url,
            &[("User-Agent", APP_NAME)],
            YOUTUBE_CAPTION_TIMEOUT,
        )
        .await
        else {
            continue;
        };
        let Ok(answer) = serde_json::from_str::<CaptionAnswer>(&body) else {
            continue;
        };
        let lines: Vec<SyncedLyricLine> = answer
            .events
            .into_iter()
            .filter_map(|event| {
                let text = event
                    .segs
                    .iter()
                    .map(|segment| segment.text.as_str())
                    .collect::<String>()
                    .replace('\n', " ")
                    .trim()
                    .to_owned();
                if text.is_empty() {
                    return None;
                }
                let start = event.start_ms / 1000.0;
                Some(SyncedLyricLine {
                    time: start,
                    text,
                    end: Some(start + event.duration_ms / 1000.0),
                    words: None,
                    bg: None,
                    roman: None,
                    translation: None,
                })
            })
            .collect();
        if let Some(result) = timed_result("YouTube captions", lines) {
            return Some(result);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(title: &str, artist: &str, duration: f64) -> Query {
        Query {
            id: "videoid1234".to_owned(),
            title: title.to_owned(),
            artist: artist.to_owned(),
            album: None,
            duration,
        }
    }

    #[test]
    fn word_stamps_are_read_from_the_enhanced_lrc_form() {
        let line = "[00:10.00]<00:10.00|00:10.40>Hel<00:10.40|00:10.90>lo";
        let stamps = word_stamps(line);
        assert_eq!(stamps.len(), 2);
        assert!((stamps[0].0 - 10.0).abs() < 1e-9);
        assert!((stamps[0].1 - 10.4).abs() < 1e-9);
        assert!((stamps[1].0 - 10.4).abs() < 1e-9);
    }

    #[test]
    fn lyrics_plus_lines_become_timed_lines_with_words() {
        let lines = lyrics_plus_lines(vec![LyricsPlusLine {
            text: "Hello world".to_owned(),
            time: 2000.0,
            duration: 1000.0,
            syllabus: vec![
                LyricsPlusWord {
                    text: "Hello".to_owned(),
                    time: 2000.0,
                    duration: 500.0,
                },
                LyricsPlusWord {
                    text: "world".to_owned(),
                    time: 2500.0,
                    duration: 500.0,
                },
            ],
        }]);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].time, 2.0);
        assert_eq!(lines[0].end, Some(3.0));
        let words = lines[0].words.as_ref().expect("words");
        assert_eq!(words.len(), 2);
        assert_eq!(words[1].start, 2.5);
    }

    #[test]
    fn a_line_without_syllabus_has_no_word_timing() {
        let lines = lyrics_plus_lines(vec![LyricsPlusLine {
            text: "Only words".to_owned(),
            time: 1000.0,
            duration: 0.0,
            syllabus: Vec::new(),
        }]);
        assert!(lines[0].words.is_none());
        assert!(lines[0].end.is_none());
    }

    #[test]
    fn a_caption_event_becomes_a_line() {
        let answer: CaptionAnswer = serde_json::from_str(
            r#"{"events":[{"tStartMs":1500,"dDurationMs":2000,"segs":[{"utf8":"Hello"}]}]}"#,
        )
        .expect("captions");
        assert_eq!(answer.events.len(), 1);
        assert_eq!(answer.events[0].start_ms, 1500.0);
    }

    #[test]
    fn the_kugou_keyword_carries_the_title_and_the_artist() {
        let q = query("Song", "Singer", 200.0);
        let keyword = format!("{} - {}", search_title(&q.title), q.artist);
        assert!(keyword.contains("Song"));
        assert!(keyword.contains("Singer"));
    }
}

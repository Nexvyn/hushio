use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::parse::{parse_lrc, plain_result, timed_result};
use super::providers::{LRCLIB_TIMEOUT, Reply, fetch, with_query};
use super::{Inner, LyricsResult};
use crate::persist;

const PROVIDER: &str = "lrclib";
const SOURCE: &str = "LRCLIB";
const SEARCH_LIMIT: usize = 10;
const PREVIEW_LINES: usize = 2;
const OWNER: &str = "guest";
const STORE: &str = "lyrics-overrides";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsCandidate {
    pub provider: String,
    pub candidate_id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub duration: Option<f64>,
    pub synced: bool,
    pub preview: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Record {
    id: i64,
    track_name: Option<String>,
    artist_name: Option<String>,
    album_name: Option<String>,
    duration: Option<f64>,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

fn non_blank(text: Option<&str>) -> Option<&str> {
    text.filter(|value| !value.trim().is_empty())
}

fn length(record: &Record) -> Option<f64> {
    record.duration.filter(|value| value.is_finite() && *value > 0.0)
}

fn preview(record: &Record) -> Vec<String> {
    let lines: Vec<String> = match non_blank(record.synced_lyrics.as_deref()) {
        Some(synced) => parse_lrc(synced).into_iter().map(|line| line.text).collect(),
        None => record
            .plain_lyrics
            .as_deref()
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect(),
    };
    lines
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .take(PREVIEW_LINES)
        .map(str::to_owned)
        .collect()
}

fn candidate(record: &Record) -> Option<LyricsCandidate> {
    let title = non_blank(record.track_name.as_deref())?.trim().to_owned();
    let synced = non_blank(record.synced_lyrics.as_deref()).is_some();
    if !synced && non_blank(record.plain_lyrics.as_deref()).is_none() {
        return None;
    }
    Some(LyricsCandidate {
        provider: PROVIDER.to_owned(),
        candidate_id: record.id.to_string(),
        title,
        artist: record.artist_name.as_deref().unwrap_or_default().trim().to_owned(),
        album: non_blank(record.album_name.as_deref()).map(|album| album.trim().to_owned()),
        duration: length(record),
        synced,
        preview: preview(record),
    })
}

fn gap(candidate: &LyricsCandidate, wanted: Option<f64>) -> f64 {
    match (wanted, candidate.duration) {
        (Some(wanted), Some(actual)) => (actual - wanted).abs(),
        _ => f64::INFINITY,
    }
}

fn rank(records: &[Record], duration: Option<f64>) -> Vec<LyricsCandidate> {
    let wanted = duration.filter(|value| value.is_finite() && *value > 0.0);
    let mut found: Vec<LyricsCandidate> = records.iter().filter_map(candidate).collect();
    found.sort_by(|a, b| gap(a, wanted).total_cmp(&gap(b, wanted)));
    found.truncate(SEARCH_LIMIT);
    found
}

pub async fn search(inner: &Inner, query: &str, duration: Option<f64>) -> Result<Vec<LyricsCandidate>, String> {
    let text = query.trim();
    if text.is_empty() {
        return Ok(Vec::new());
    }
    let url = with_query(&inner.hosts.lrclib, "/search", &[("q", text.to_owned())]);
    let body = match fetch(&inner.http, &url, &[], LRCLIB_TIMEOUT).await {
        Reply::Body(body) => body,
        Reply::Status(code) => return Err(format!("LRCLIB answered with status {code}")),
        Reply::Down => return Err("LRCLIB could not be reached".to_owned()),
    };
    let records: Vec<Record> =
        serde_json::from_str(&body).map_err(|_| "LRCLIB sent an unreadable answer".to_owned())?;
    Ok(rank(&records, duration))
}

fn lyrics_of(record: &Record) -> Option<LyricsResult> {
    non_blank(record.synced_lyrics.as_deref())
        .and_then(|synced| timed_result(SOURCE, parse_lrc(synced)))
        .or_else(|| non_blank(record.plain_lyrics.as_deref()).map(|plain| plain_result(SOURCE, plain.to_owned())))
}

pub async fn fetch_candidate(inner: &Inner, provider: &str, candidate_id: &str) -> Result<LyricsResult, String> {
    let numeric = !candidate_id.is_empty() && candidate_id.bytes().all(|byte| byte.is_ascii_digit());
    if provider != PROVIDER || !numeric {
        return Err("That result cannot be loaded".to_owned());
    }
    let url = with_query(&inner.hosts.lrclib, &format!("/get/{candidate_id}"), &[]);
    let body = match fetch(&inner.http, &url, &[], LRCLIB_TIMEOUT).await {
        Reply::Body(body) => body,
        Reply::Status(code) => return Err(format!("LRCLIB answered with status {code}")),
        Reply::Down => return Err("LRCLIB could not be reached".to_owned()),
    };
    let record: Record =
        serde_json::from_str(&body).map_err(|_| "LRCLIB sent an unreadable answer".to_owned())?;
    lyrics_of(&record).ok_or_else(|| "That result has no lyrics".to_owned())
}

pub async fn read_overrides(root: &Path) -> HashMap<String, LyricsResult> {
    persist::read(root, OWNER, STORE)
        .await
        .and_then(|value| serde_json::from_value(value.get("state").cloned().unwrap_or(Value::Null)).ok())
        .unwrap_or_default()
}

pub async fn write_overrides(root: &Path, overrides: &HashMap<String, LyricsResult>) -> Result<(), String> {
    let state = serde_json::to_value(overrides).map_err(|error| error.to_string())?;
    persist::write(root, OWNER, STORE, &json!({ "state": state, "version": 1 })).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lyrics::{SWEEP_CEILING, Service};
    use crate::lyrics::test_support::{local_hosts, serve};
    use axum::Router;
    use axum::http::StatusCode;
    use axum::routing::get;

    const FIXTURE: &str = include_str!("fixtures/lrclib_search_coldplay_yellow.json");

    fn records() -> Vec<Record> {
        serde_json::from_str(FIXTURE).expect("live fixture parses")
    }

    #[test]
    fn live_search_answer_becomes_candidates_with_previews() {
        let found = rank(&records(), None);
        assert_eq!(found.len(), 3);
        let first = &found[0];
        assert_eq!(first.provider, "lrclib");
        assert_eq!(first.candidate_id, "33756008");
        assert_eq!(first.title, "Coldplay - Yellow");
        assert_eq!(first.artist, "Coldplay");
        assert_eq!(first.album.as_deref(), Some("Coldplay - Yellow"));
        assert_eq!(first.duration, Some(273.0));
        assert!(first.synced);
        assert_eq!(first.preview, vec!["Look at the stars", "Look how they shine for you"]);
    }

    #[test]
    fn candidates_closest_in_length_come_first() {
        let found = rank(&records(), Some(268.0));
        let order: Vec<&str> = found.iter().map(|candidate| candidate.candidate_id.as_str()).collect();
        assert_eq!(order, ["19324084", "12178051", "33756008"]);
    }

    #[test]
    fn search_keeps_the_provider_order_when_no_duration_is_known() {
        let found = rank(&records(), None);
        let order: Vec<&str> = found.iter().map(|candidate| candidate.candidate_id.as_str()).collect();
        assert_eq!(order, ["33756008", "19324084", "12178051"]);
    }

    #[test]
    fn records_without_lyrics_are_left_out_and_plain_only_is_not_synced() {
        let body = r#"[
            {"id":1,"trackName":"A","artistName":"B","duration":null,"syncedLyrics":null,"plainLyrics":"first\n\nsecond\nthird"},
            {"id":2,"trackName":"C","artistName":"D","syncedLyrics":"  ","plainLyrics":null},
            {"id":3,"trackName":"","artistName":"D","syncedLyrics":"[00:01.00]x","plainLyrics":null}
        ]"#;
        let records: Vec<Record> = serde_json::from_str(body).expect("records");
        let found = rank(&records, None);
        assert_eq!(found.len(), 1);
        assert!(!found[0].synced);
        assert_eq!(found[0].preview, vec!["first", "second"]);
        assert_eq!(found[0].duration, None);
    }

    #[test]
    fn at_most_ten_candidates_are_returned() {
        let records: Vec<Record> = (0..12)
            .map(|id| {
                serde_json::from_value(json!({
                    "id": id,
                    "trackName": format!("Song {id}"),
                    "artistName": "Singer",
                    "plainLyrics": "words"
                }))
                .expect("record")
            })
            .collect();
        assert_eq!(rank(&records, None).len(), SEARCH_LIMIT);
    }

    #[tokio::test]
    async fn search_returns_the_ranked_candidates_from_lrclib() {
        let base = serve(|_| Router::new().route("/api/search", get(|| async { FIXTURE }))).await;
        let service = Service::with_hosts(local_hosts(&base), SWEEP_CEILING).expect("client");
        let found = search(&service.inner, "Coldplay Yellow", Some(272.0)).await.expect("search");
        assert_eq!(found[0].candidate_id, "12178051");
    }

    #[tokio::test]
    async fn search_reports_a_failed_answer_instead_of_no_results() {
        let base = serve(|_| {
            Router::new().route("/api/search", get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "") }))
        })
        .await;
        let service = Service::with_hosts(local_hosts(&base), SWEEP_CEILING).expect("client");
        let error = search(&service.inner, "Coldplay Yellow", None).await.expect_err("error");
        assert_eq!(error, "LRCLIB answered with status 500");
    }

    #[tokio::test]
    async fn blank_search_asks_lrclib_nothing() {
        let service = Service::with_hosts(local_hosts("http://127.0.0.1:9"), SWEEP_CEILING).expect("client");
        assert!(search(&service.inner, "   ", None).await.expect("empty").is_empty());
    }
}

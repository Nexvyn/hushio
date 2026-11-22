use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use scraper::{ElementRef, Html, Node, Selector};
use serde::Deserialize;
use serde_json::Value;
use tracing::info;

use super::matching::{
    clean_title, genius_clean_query, names_recording, plain_words, query_title, search_title,
};
use super::parse::{Parsed, parse_lrc, parse_provider_any, parse_ttml, plain_result, timed_result, without_opening};
use super::{Inner, LyricsResult, Query};
use crate::APP_NAME;

const DEFAULT_TIMEOUT: Duration = Duration::from_millis(6000);
pub(super) const LRCLIB_TIMEOUT: Duration = Duration::from_millis(7000);
const APPLE_PAGE_TIMEOUT: Duration = Duration::from_millis(8000);
const APPLE_SEARCH_TIMEOUT: Duration = Duration::from_millis(7000);
const PAXSENIX_TIMEOUT: Duration = Duration::from_millis(8000);
const GENIUS_SEARCH_TIMEOUT: Duration = Duration::from_millis(8000);
const GENIUS_PAGE_TIMEOUT: Duration = Duration::from_millis(9000);
const SAME_RECORDING_SEC: f64 = 3.0;
const PAX_CANDIDATES: usize = 3;
const LRCLIB_SYNCED_MIN_LINES: usize = 3;
const BROWSER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GENIUS_HEADERS: [(&str, &str); 3] = [
    ("User-Agent", APP_NAME),
    (
        "Accept",
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
    ),
    ("Accept-Language", "en-US,en;q=0.9"),
];
const GENIUS_EXCLUDED_CLASSES: [&str; 3] = [
    "LyricsHeader__Container",
    "SongBioPreview__Container",
    "InreadAd__Container",
];

static SCRIPT_PATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"/assets/index~[^"]+\.js"#).expect("script path regex"));
static APPLE_TOKEN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+").expect("token regex"));
static TTML_ROOT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)<tt[\s>]").expect("ttml root regex"));
static GENIUS_EMBED_TAIL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\d*Embed\s*$").expect("embed tail regex"));

pub(super) enum Reply {
    Body(String),
    Status(u16),
    Down,
}

impl Reply {
    fn body(self) -> Option<String> {
        match self {
            Reply::Body(body) => Some(body),
            Reply::Status(_) | Reply::Down => None,
        }
    }
}

pub(super) async fn fetch(
    http: &reqwest::Client,
    url: &str,
    headers: &[(&str, &str)],
    limit: Duration,
) -> Reply {
    let mut request = http.get(url).timeout(limit);
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    match request.send().await {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                info!("[lyrics-net] HTTP {}", status.as_u16());
                return Reply::Status(status.as_u16());
            }
            match response.text().await {
                Ok(body) => Reply::Body(body),
                Err(error) => {
                    info!("[lyrics-net] FAIL {url}: {error}");
                    Reply::Down
                }
            }
        }
        Err(error) => {
            info!("[lyrics-net] FAIL {url}: {error}");
            Reply::Down
        }
    }
}

pub(super) fn with_query(base: &str, path: &str, params: &[(&str, String)]) -> String {
    reqwest::Url::parse_with_params(&format!("{base}{path}"), params)
        .expect("lyric host url")
        .to_string()
}

fn search_params(query: &Query) -> Vec<(&'static str, String)> {
    let mut params = vec![
        ("s", search_title(&query.title)),
        ("a", query.artist.clone()),
    ];
    if query.duration > 0.0 {
        params.push(("d", query.duration.round().to_string()));
    }
    if let Some(album) = query.album.as_deref() {
        let album = clean_title(album);
        if !album.is_empty() {
            params.push(("al", album));
        }
    }
    params
}

pub async fn better_lyrics(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let url = with_query(&inner.hosts.boidu, "/getLyrics", &search_params(query));
    let body = fetch(&inner.http, &url, &[], DEFAULT_TIMEOUT).await.body()?;
    let ttml = serde_json::from_str::<Value>(&body)
        .ok()?
        .get("ttml")?
        .as_str()?
        .to_owned();
    timed_result("BetterLyrics", parse_ttml(&ttml))
}

pub async fn portato(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    if inner.portato_gated.load(std::sync::atomic::Ordering::Relaxed) {
        return None;
    }
    let url = with_query(&inner.hosts.boidu, "/qq/getLyrics", &search_params(query));
    let body = fetch(&inner.http, &url, &[], DEFAULT_TIMEOUT).await.body()?;
    if body.to_ascii_lowercase().contains("api key required") {
        inner
            .portato_gated
            .store(true, std::sync::atomic::Ordering::Relaxed);
        info!("[lyrics] Portato: API key required, parked for this session");
        return None;
    }
    match parse_provider_any(&body)? {
        Parsed::Plain(text) => Some(plain_result("Portato", text)),
        Parsed::Timed(lines) => {
            if query.duration > 0.0
                && lines
                    .iter()
                    .any(|line| line.time > query.duration + SAME_RECORDING_SEC)
            {
                return None;
            }
            timed_result("Portato", without_opening(lines))
        }
    }
}

#[derive(Clone)]
struct AppleSong {
    id: String,
    name: String,
    artist: String,
    duration: f64,
}

fn parse_songs(body: &str) -> Vec<AppleSong> {
    let Ok(value) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };
    value["results"]["songs"]["data"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let attributes = &item["attributes"];
                    Some(AppleSong {
                        id: item["id"].as_str()?.to_owned(),
                        name: attributes["name"].as_str()?.to_owned(),
                        artist: attributes["artistName"].as_str()?.to_owned(),
                        duration: (attributes["durationInMillis"].as_f64()? / 1000.0).round(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn apple_token(inner: &Inner) -> Option<String> {
    let cached = inner.apple_token.lock().expect("apple token lock").clone();
    if cached.is_some() {
        return cached;
    }
    let page = fetch(
        &inner.http,
        &format!("{}/us/new", inner.hosts.apple),
        &[("Accept", "text/html"), ("User-Agent", BROWSER_AGENT)],
        APPLE_PAGE_TIMEOUT,
    )
    .await
    .body()?;
    let script = SCRIPT_PATH.find(&page)?.as_str();
    let code = fetch(
        &inner.http,
        &format!("{}{script}", inner.hosts.apple),
        &[("Accept", "*/*"), ("User-Agent", BROWSER_AGENT)],
        APPLE_PAGE_TIMEOUT,
    )
    .await
    .body()?;
    let token = APPLE_TOKEN.find(&code)?.as_str().to_owned();
    *inner.apple_token.lock().expect("apple token lock") = Some(token.clone());
    Some(token)
}

async fn apple_search(inner: &Inner, term: &str) -> Option<Vec<AppleSong>> {
    for attempt in 0..2 {
        let token = apple_token(inner).await?;
        let url = with_query(
            &inner.hosts.amp,
            "/v1/catalog/us/search",
            &[
                ("term", term.to_owned()),
                ("types", "songs".to_owned()),
                ("limit", "10".to_owned()),
                ("l", "en-US".to_owned()),
            ],
        );
        let authorization = format!("Bearer {token}");
        let headers = [
            ("Authorization", authorization.as_str()),
            ("Origin", "https://music.apple.com"),
            ("Referer", "https://music.apple.com/"),
        ];
        match fetch(&inner.http, &url, &headers, APPLE_SEARCH_TIMEOUT).await {
            Reply::Body(body) => return Some(parse_songs(&body)),
            Reply::Status(401) | Reply::Down if attempt == 0 => {
                *inner.apple_token.lock().expect("apple token lock") = None;
            }
            _ => return None,
        }
    }
    None
}

pub async fn pax_senix(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let term = format!("{} {}", search_title(&query.title), query.artist)
        .trim()
        .to_owned();
    let mut songs = apple_search(inner, &term).await?;
    songs.retain(|song| names_recording(query, &song.name, &song.artist, Some(song.duration), false));
    songs.sort_by(|a, b| pax_distance(query, a).total_cmp(&pax_distance(query, b)));
    let first = songs.first()?.duration;
    songs.retain(|song| (song.duration - first).abs() <= SAME_RECORDING_SEC);
    for song in songs.iter().take(PAX_CANDIDATES) {
        if let Some(result) = pax_lyrics(inner, &song.id).await {
            return Some(result);
        }
    }
    None
}

fn pax_distance(query: &Query, song: &AppleSong) -> f64 {
    if query.duration > 0.0 {
        (song.duration - query.duration).abs()
    } else {
        99999.0
    }
}

async fn pax_lyrics(inner: &Inner, id: &str) -> Option<LyricsResult> {
    let url = with_query(
        &inner.hosts.paxsenix,
        "/apple-music/lyrics",
        &[("id", id.to_owned()), ("ttml", "true".to_owned())],
    );
    let body = fetch(&inner.http, &url, &[], PAXSENIX_TIMEOUT).await.body()?;
    let value: Value = serde_json::from_str(&body).ok()?;
    for key in ["ttmlContent", "content"] {
        if let Some(ttml) = value[key].as_str().filter(|text| TTML_ROOT.is_match(text)) {
            if let Some(result) = timed_result("PaxSenix", parse_ttml(ttml)) {
                return Some(result);
            }
        }
    }
    for key in ["elrcMultiPerson", "elrc"] {
        if let Some(lrc) = value[key].as_str() {
            if let Some(result) = timed_result("PaxSenix", parse_lrc(lrc)) {
                return Some(result);
            }
        }
    }
    None
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibRecord {
    track_name: Option<String>,
    artist_name: Option<String>,
    duration: Option<f64>,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

fn names_record(query: &Query, record: &LrclibRecord) -> bool {
    names_recording(
        query,
        record.track_name.as_deref().unwrap_or_default(),
        record.artist_name.as_deref().unwrap_or_default(),
        record.duration,
        false,
    )
}

fn length_gap(query: &Query, length: Option<f64>) -> f64 {
    match length {
        Some(length) if query.duration > 0.0 => (length - query.duration).abs(),
        _ => 0.0,
    }
}

fn pick_lrclib(query: &Query, records: &[LrclibRecord]) -> Option<LyricsResult> {
    let tolerance = (query.duration * 0.08).max(12.0);
    let record = records
        .iter()
        .filter(|record| {
            record
                .synced_lyrics
                .as_deref()
                .is_some_and(|lyrics| !lyrics.trim().is_empty())
        })
        .filter(|record| names_record(query, record))
        .filter(|record| length_gap(query, record.duration) <= tolerance)
        .min_by(|a, b| {
            length_gap(query, a.duration).total_cmp(&length_gap(query, b.duration))
        })?;
    timed_result("LRCLIB", parse_lrc(record.synced_lyrics.as_deref()?))
}

async fn lrclib_json<T: for<'de> Deserialize<'de>>(inner: &Inner, path: &str, params: &[(&str, String)]) -> Option<T> {
    let url = with_query(&inner.hosts.lrclib, path, params);
    let body = fetch(&inner.http, &url, &[], LRCLIB_TIMEOUT).await.body()?;
    serde_json::from_str(&body).ok()
}

pub async fn lrclib(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    let track = search_title(&query.title);
    let mut get_params = vec![
        ("artist_name", query.artist.clone()),
        ("track_name", track.clone()),
    ];
    if let Some(album) = query.album.as_deref() {
        get_params.push(("album_name", clean_title(album)));
    }
    if query.duration > 0.0 {
        get_params.push(("duration", query.duration.round().to_string()));
    }
    let mut plain = None;
    if let Some(record) = lrclib_json::<LrclibRecord>(inner, "/get", &get_params).await {
        if names_record(query, &record) {
            let synced = record
                .synced_lyrics
                .as_deref()
                .map(parse_lrc)
                .unwrap_or_default();
            if synced.len() >= LRCLIB_SYNCED_MIN_LINES {
                if let Some(result) = timed_result("LRCLIB", synced) {
                    return Some(result);
                }
            }
            plain = record
                .plain_lyrics
                .filter(|text| !text.trim().is_empty())
                .map(|text| plain_result("LRCLIB", text));
        }
    }
    let by_name: Vec<LrclibRecord> = lrclib_json(
        inner,
        "/search",
        &[
            ("track_name", track.clone()),
            ("artist_name", query.artist.clone()),
        ],
    )
    .await
    .unwrap_or_default();
    if let Some(result) = pick_lrclib(query, &by_name) {
        return Some(result);
    }
    let by_query: Vec<LrclibRecord> = lrclib_json(
        inner,
        "/search",
        &[(
            "q",
            format!("{} {}", query.artist, query_title(&query.title)),
        )],
    )
    .await
    .unwrap_or_default();
    pick_lrclib(query, &by_query).or(plain)
}

#[derive(Deserialize)]
struct GeniusSong {
    url: String,
    path: String,
    title: String,
    artist_names: String,
}

fn genius_songs(body: &str) -> Vec<GeniusSong> {
    let Ok(value) = serde_json::from_str::<Value>(body) else {
        return Vec::new();
    };
    value["response"]["sections"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|section| section["type"] == "song")
        .flat_map(|section| section["hits"].as_array().into_iter().flatten())
        .filter_map(|hit| serde_json::from_value(hit["result"].clone()).ok())
        .collect()
}

fn genius_score(query: &Query, song: &GeniusSong) -> i32 {
    let mut score = 0;
    let wanted_title = plain_words(&query_title(&query.title));
    let title = plain_words(&song.title);
    if !wanted_title.is_empty() && !title.is_empty() {
        if title == wanted_title {
            score += 50;
        } else if title.contains(&wanted_title) || wanted_title.contains(&title) {
            score += 25;
        }
    }
    let wanted_artist = plain_words(&query.artist);
    let artist = plain_words(&song.artist_names);
    if !wanted_artist.is_empty() && !artist.is_empty() {
        if artist == wanted_artist {
            score += 40;
        } else if artist.contains(&wanted_artist) || wanted_artist.contains(&artist) {
            score += 20;
        }
    }
    let path = song.path.to_lowercase();
    if path.contains("translation") && !query.title.to_lowercase().contains("translation") {
        score -= 30;
    }
    if path.contains("türkçe") || path.contains("polskie-tlumaczenie") {
        score -= 40;
    }
    if path.contains("tracklist") || path.contains("album-art") {
        score -= 50;
    }
    score
}

fn best_genius<'a>(query: &Query, songs: &'a [GeniusSong]) -> Option<&'a GeniusSong> {
    songs
        .iter()
        .filter(|song| names_recording(query, &song.title, &song.artist_names, None, true))
        .map(|song| (genius_score(query, song), song))
        .filter(|(score, _)| *score > 0)
        .max_by_key(|(score, _)| *score)
        .map(|(_, song)| song)
}

fn genius_attempts(query: &Query) -> Vec<String> {
    let title = query_title(&query.title);
    let clean = genius_clean_query(&query.title);
    let artist = query.artist.trim();
    let mut attempts: Vec<String> = Vec::new();
    for candidate in [format!("{artist} {title}"), format!("{artist} {clean}"), clean] {
        let candidate = candidate.trim().to_owned();
        if !candidate.is_empty() && !attempts.contains(&candidate) {
            attempts.push(candidate);
        }
    }
    attempts
}

fn skipped_element(element: &scraper::node::Element) -> bool {
    matches!(element.name(), "button" | "script" | "style")
        || element.attr("data-exclude-from-selection") == Some("true")
        || element
            .classes()
            .any(|class| GENIUS_EXCLUDED_CLASSES.contains(&class))
}

fn collect_text(element: ElementRef, out: &mut String) {
    if skipped_element(element.value()) {
        return;
    }
    match element.value().name() {
        "br" => {
            out.push('\n');
            return;
        }
        "p" => out.push('\n'),
        _ => {}
    }
    for child in element.children() {
        match child.value() {
            Node::Text(text) => out.push_str(text),
            Node::Element(_) => {
                if let Some(inner) = ElementRef::wrap(child) {
                    collect_text(inner, out);
                }
            }
            _ => {}
        }
    }
}

fn extract_lyrics(page: &str) -> Option<String> {
    let document = Html::parse_document(page);
    let primary = Selector::parse(r#"div[data-lyrics-container="true"]"#).expect("container selector");
    let fallback = Selector::parse("div.lyrics").expect("fallback selector");
    let mut containers: Vec<ElementRef> = document.select(&primary).collect();
    if containers.is_empty() {
        containers = document.select(&fallback).collect();
    }
    let mut text = String::new();
    for container in containers {
        collect_text(container, &mut text);
    }
    let cleaned = text
        .replace(['\u{a0}', '\u{200b}', '\u{feff}'], "")
        .replace("You might also like", "");
    let without_embed = GENIUS_EMBED_TAIL.replace(cleaned.trim_end(), "");
    let lyrics = without_embed.trim();
    (!lyrics.is_empty()).then(|| lyrics.to_owned())
}

pub async fn genius(inner: &Inner, query: &Query) -> Option<LyricsResult> {
    for attempt in genius_attempts(query) {
        let url = with_query(&inner.hosts.genius, "/api/search/multi", &[("q", attempt)]);
        let Some(body) = fetch(&inner.http, &url, &GENIUS_HEADERS, GENIUS_SEARCH_TIMEOUT)
            .await
            .body()
        else {
            continue;
        };
        let songs = genius_songs(&body);
        let Some(song) = best_genius(query, &songs) else {
            continue;
        };
        let page = fetch(&inner.http, &song.url, &GENIUS_HEADERS, GENIUS_PAGE_TIMEOUT)
            .await
            .body()?;
        return extract_lyrics(&page).map(|text| plain_result("Genius", text));
    }
    None
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use axum::Router;
    use axum::http::HeaderMap;
    use axum::routing::get;

    use super::*;
    use crate::lyrics::test_support::{local_hosts, serve};
    use crate::lyrics::{LyricsMeta, SWEEP_CEILING, Service};

    const BETTER_BODY: &str = r#"{"ttml":"<tt><body><div><p begin=\"1s\" end=\"2s\">Hello there</p><p begin=\"180s\" end=\"182s\">second line</p></div></body></tt>"}"#;
    const PORTATO_PLAIN: &str = "plain portato words";
    const LRCLIB_RECORD: &str = r#"{"trackName":"Song","artistName":"Singer","duration":200,"syncedLyrics":"[00:01.00]one\n[00:02.00]two\n[03:00.00]three","plainLyrics":"one\ntwo\nthree"}"#;
    const LRCLIB_SEARCH: &str = r#"[{"trackName":"Song","artistName":"Singer","duration":240,"syncedLyrics":"[00:01.00]far"},{"trackName":"Song","artistName":"Singer","duration":201,"syncedLyrics":"[00:01.00]near"}]"#;
    const GENIUS_SEARCH: &str = r#"{"response":{"sections":[{"type":"song","hits":[{"result":{"url":"BASE/song","path":"/other-song-lyrics","title":"Other Song","artist_names":"Singer"}},{"result":{"url":"BASE/song","path":"/singer-song-lyrics","title":"Song","artist_names":"Singer"}}]}]}}"#;
    const GENIUS_PAGE: &str = r#"<html><body><div data-lyrics-container="true">Line one<br/>Line two<p>Stanza</p>You might also like<button>Share</button>123Embed</div></body></html>"#;

    fn query(title: &str, artist: &str, duration: f64) -> Query {
        Query {
            id: "id".to_owned(),
            title: title.to_owned(),
            artist: artist.to_owned(),
            album: None,
            duration,
        }
    }

    fn counter() -> Arc<AtomicUsize> {
        Arc::new(AtomicUsize::new(0))
    }

    fn counted(hits: Arc<AtomicUsize>, body: &'static str) -> impl Fn() -> std::future::Ready<&'static str> + Clone {
        move || {
            hits.fetch_add(1, Ordering::SeqCst);
            std::future::ready(body)
        }
    }

    async fn service(build: impl FnOnce(&str) -> Router, ceiling: Duration) -> Service {
        let base = serve(build).await;
        Service::with_hosts(local_hosts(&base), ceiling).expect("client")
    }

    #[tokio::test]
    async fn better_lyrics_reads_ttml_from_its_envelope() {
        let svc = service(
            |_| Router::new().route("/getLyrics", get(|| async { BETTER_BODY })),
            SWEEP_CEILING,
        )
        .await;
        let result = better_lyrics(&svc.inner, &query("Song", "Singer", 0.0))
            .await
            .expect("answer");
        let lines = result.synced.expect("synced");
        assert_eq!(result.source, "BetterLyrics");
        assert_eq!(lines[1].text, "second line");
        assert_eq!(lines[0].end, Some(2.0));
    }

    #[tokio::test]
    async fn portato_api_key_gate_parks_the_provider_for_the_session() {
        let hits = counter();
        let gate = hits.clone();
        let svc = service(
            move |_| {
                Router::new().route(
                    "/qq/getLyrics",
                    get(counted(gate, "API key required for this route")),
                )
            },
            SWEEP_CEILING,
        )
        .await;
        let q = query("Song", "Singer", 0.0);
        assert!(portato(&svc.inner, &q).await.is_none());
        assert!(portato(&svc.inner, &q).await.is_none());
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn portato_timed_answer_past_the_track_end_is_dropped() {
        let svc = service(
            |_| {
                Router::new().route(
                    "/qq/getLyrics",
                    get(|| async { "[00:01.00]early\n[05:00.00]from another track" }),
                )
            },
            SWEEP_CEILING,
        )
        .await;
        assert!(portato(&svc.inner, &query("Song", "Singer", 200.0)).await.is_none());
    }

    #[tokio::test]
    async fn portato_plain_answer_is_a_plain_result() {
        let svc = service(
            |_| Router::new().route("/qq/getLyrics", get(|| async { PORTATO_PLAIN })),
            SWEEP_CEILING,
        )
        .await;
        let result = portato(&svc.inner, &query("Song", "Singer", 200.0))
            .await
            .expect("plain");
        assert_eq!(result.plain.as_deref(), Some(PORTATO_PLAIN));
        assert!(!result.word_synced);
    }

    #[tokio::test]
    async fn pax_senix_refreshes_the_apple_token_after_a_401() {
        let token_hits = counter();
        let search_hits = counter();
        let search_count = search_hits.clone();
        let page_hits = token_hits.clone();
        let svc = service(
            move |_| {
                Router::new()
                    .route(
                        "/us/new",
                        get(move || {
                            page_hits.fetch_add(1, Ordering::SeqCst);
                            async { r#"<script src="/assets/index~abc123.js"></script>"# }
                        }),
                    )
                    .route(
                        "/assets/index~abc123.js",
                        get(|| async { r#"var t="eyJhbGciOi.eyJzdWIiOi.sig-part";"# }),
                    )
                    .route(
                        "/v1/catalog/us/search",
                        get(move |headers: HeaderMap| {
                            let attempt = search_count.fetch_add(1, Ordering::SeqCst);
                            let authorized = headers
                                .get("authorization")
                                .and_then(|value| value.to_str().ok())
                                .is_some_and(|value| value.starts_with("Bearer eyJ"));
                            async move {
                                if attempt == 0 || !authorized {
                                    return (axum::http::StatusCode::UNAUTHORIZED, String::new());
                                }
                                (
                                    axum::http::StatusCode::OK,
                                    r#"{"results":{"songs":{"data":[{"id":"42","attributes":{"name":"Song","artistName":"Singer","durationInMillis":200000}}]}}}"#.to_owned(),
                                )
                            }
                        }),
                    )
                    .route(
                        "/apple-music/lyrics",
                        get(|| async {
                            r#"{"ttmlContent":"<tt><body><p begin=\"1s\">Pax line</p></body></tt>"}"#
                        }),
                    )
            },
            SWEEP_CEILING,
        )
        .await;
        let result = pax_senix(&svc.inner, &query("Song", "Singer", 200.0))
            .await
            .expect("answer");
        assert_eq!(result.synced.expect("synced")[0].text, "Pax line");
        assert_eq!(token_hits.load(Ordering::SeqCst), 2);
        assert_eq!(search_hits.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn pax_senix_skips_candidates_that_fail_the_name_gate() {
        let svc = service(
            |_| {
                Router::new()
                    .route("/us/new", get(|| async { r#"<script src="/assets/index~x.js">"# }))
                    .route(
                        "/assets/index~x.js",
                        get(|| async { "eyJhbGciOi.eyJzdWIiOi.sig-part" }),
                    )
                    .route(
                        "/v1/catalog/us/search",
                        get(|| async {
                            r#"{"results":{"songs":{"data":[{"id":"7","attributes":{"name":"Other Song","artistName":"Singer","durationInMillis":200000}}]}}}"#
                        }),
                    )
            },
            SWEEP_CEILING,
        )
        .await;
        assert!(pax_senix(&svc.inner, &query("Song", "Singer", 200.0)).await.is_none());
    }

    #[tokio::test]
    async fn lrclib_synced_get_answer_wins_before_search() {
        let search_hits = counter();
        let search_gate = search_hits.clone();
        let svc = service(
            move |_| {
                Router::new()
                    .route("/api/get", get(|| async { LRCLIB_RECORD }))
                    .route("/api/search", get(counted(search_gate, "[]")))
            },
            SWEEP_CEILING,
        )
        .await;
        let result = lrclib(&svc.inner, &query("Song", "Singer", 200.0))
            .await
            .expect("answer");
        assert_eq!(result.synced.expect("synced").len(), 3);
        assert_eq!(search_hits.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn lrclib_search_picks_the_record_closest_in_length() {
        let svc = service(
            |_| {
                Router::new()
                    .route("/api/get", get(|| async { (axum::http::StatusCode::NOT_FOUND, "") }))
                    .route("/api/search", get(|| async { LRCLIB_SEARCH }))
            },
            SWEEP_CEILING,
        )
        .await;
        let result = lrclib(&svc.inner, &query("Song", "Singer", 200.0))
            .await
            .expect("answer");
        assert_eq!(result.synced.expect("synced")[0].text, "near");
    }

    #[tokio::test]
    async fn genius_scrapes_the_named_song_and_drops_page_chrome() {
        let svc = service(
            |base| {
                let search = GENIUS_SEARCH.replace("BASE", base);
                Router::new()
                    .route(
                        "/api/search/multi",
                        get(move || {
                            let search = search.clone();
                            async move { search }
                        }),
                    )
                    .route("/song", get(|| async { GENIUS_PAGE }))
            },
            SWEEP_CEILING,
        )
        .await;
        let result = genius(&svc.inner, &query("Song", "Singer", 0.0))
            .await
            .expect("answer");
        assert_eq!(result.plain.as_deref(), Some("Line one\nLine two\nStanza"));
        assert!(result.synced.is_none());
    }

    #[tokio::test]
    async fn timed_request_gives_up_after_its_timeout() {
        let svc = service(
            |_| {
                Router::new().route(
                    "/slow",
                    get(|| async {
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        "late"
                    }),
                )
            },
            SWEEP_CEILING,
        )
        .await;
        let url = format!("{}/slow", svc.inner.hosts.boidu);
        let reply = fetch(&svc.inner.http, &url, &[], Duration::from_millis(100)).await;
        assert!(matches!(reply, Reply::Down));
    }

    #[tokio::test]
    async fn sweep_prefers_the_higher_priority_timed_answer() {
        let svc = service(
            |_| {
                Router::new()
                    .route("/getLyrics", get(|| async { BETTER_BODY }))
                    .route("/api/get", get(|| async { LRCLIB_RECORD }))
            },
            SWEEP_CEILING,
        )
        .await;
        let result = svc
            .get(LyricsMeta {
                id: "a".to_owned(),
                title: "Song".to_owned(),
                artist: "Singer".to_owned(),
                album: None,
                duration: Some(200.0),
                providers: None,
            })
            .await
            .expect("winner");
        assert_eq!(result.source, "BetterLyrics");
    }

    #[tokio::test]
    async fn sweep_plain_answer_never_beats_a_timed_answer_and_skips_genius() {
        let genius_hits = counter();
        let genius_gate = genius_hits.clone();
        let svc = service(
            move |_| {
                Router::new()
                    .route("/qq/getLyrics", get(|| async { PORTATO_PLAIN }))
                    .route("/api/get", get(|| async { LRCLIB_RECORD }))
                    .route("/api/search/multi", get(counted(genius_gate.clone(), "{}")))
            },
            SWEEP_CEILING,
        )
        .await;
        let result = svc
            .get(LyricsMeta {
                id: "b".to_owned(),
                title: "Song".to_owned(),
                artist: "Singer".to_owned(),
                album: None,
                duration: Some(200.0),
                providers: None,
            })
            .await
            .expect("winner");
        assert_eq!(result.source, "LRCLIB");
        assert_eq!(genius_hits.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn sweep_skips_genius_when_a_plain_fallback_exists() {
        let genius_hits = counter();
        let genius_gate = genius_hits.clone();
        let svc = service(
            move |_| {
                Router::new()
                    .route("/qq/getLyrics", get(|| async { PORTATO_PLAIN }))
                    .route("/api/search/multi", get(counted(genius_gate.clone(), "{}")))
            },
            SWEEP_CEILING,
        )
        .await;
        let result = svc
            .get(LyricsMeta {
                id: "f".to_owned(),
                title: "Song".to_owned(),
                artist: "Singer".to_owned(),
                album: None,
                duration: Some(200.0),
                providers: None,
            })
            .await
            .expect("plain fallback");
        assert_eq!(result.source, "Portato");
        assert_eq!(genius_hits.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn sweep_drops_a_provider_still_pending_at_the_ceiling() {
        let svc = service(
            |_| {
                Router::new()
                    .route(
                        "/getLyrics",
                        get(|| async {
                            tokio::time::sleep(Duration::from_secs(2)).await;
                            BETTER_BODY
                        }),
                    )
                    .route("/api/get", get(|| async { LRCLIB_RECORD }))
            },
            Duration::from_millis(300),
        )
        .await;
        let result = svc
            .get(LyricsMeta {
                id: "c".to_owned(),
                title: "Song".to_owned(),
                artist: "Singer".to_owned(),
                album: None,
                duration: Some(200.0),
                providers: None,
            })
            .await
            .expect("winner");
        assert_eq!(result.source, "LRCLIB");
    }

    #[tokio::test]
    async fn sweep_returns_nothing_when_every_answer_fails_the_name_gate() {
        let svc = service(
            |_| {
                Router::new().route(
                    "/api/get",
                    get(|| async {
                        r#"{"trackName":"Another Song","artistName":"Singer","duration":200,"syncedLyrics":"[00:01.00]x\n[00:02.00]y\n[03:00.00]z"}"#
                    }),
                )
            },
            SWEEP_CEILING,
        )
        .await;
        let found = svc
            .get(LyricsMeta {
                id: "d".to_owned(),
                title: "Song".to_owned(),
                artist: "Singer".to_owned(),
                album: None,
                duration: Some(200.0),
                providers: None,
            })
            .await;
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn repeat_lookup_is_served_from_the_cache() {
        let hits = counter();
        let gate = hits.clone();
        let svc = service(
            move |_| Router::new().route("/api/get", get(counted(gate, LRCLIB_RECORD))),
            SWEEP_CEILING,
        )
        .await;
        let meta = || LyricsMeta {
            id: "e".to_owned(),
            title: "Song".to_owned(),
            artist: "Singer".to_owned(),
            album: None,
            duration: Some(200.0),
            providers: None,
        };
        assert!(svc.get(meta()).await.is_some());
        let first = hits.load(Ordering::SeqCst);
        assert!(svc.get(meta()).await.is_some());
        assert_eq!(hits.load(Ordering::SeqCst), first);
    }

    #[tokio::test]
    async fn cached_miss_is_not_looked_up_again() {
        let hits = counter();
        let gate = hits.clone();
        let svc = service(
            move |_| Router::new().route("/api/get", get(counted(gate, "{}"))),
            SWEEP_CEILING,
        )
        .await;
        let meta = || LyricsMeta {
            id: "miss".to_owned(),
            title: "Song".to_owned(),
            artist: "Singer".to_owned(),
            album: None,
            duration: Some(200.0),
            providers: None,
        };
        assert!(svc.get(meta()).await.is_none());
        let first = hits.load(Ordering::SeqCst);
        assert!(first > 0);
        assert!(svc.get(meta()).await.is_none());
        assert_eq!(hits.load(Ordering::SeqCst), first);
    }
}

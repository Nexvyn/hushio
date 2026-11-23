use std::error::Error;
use std::time::Duration;

use rand::distributions::Alphanumeric;
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use super::{NetworkTrack, Server};

pub const API_VERSION: &str = "1.16.1";
pub const CLIENT_NAME: &str = "Hushio";
pub const SCAN_CAP: usize = 20_000;
const PAGE_SIZE: usize = 500;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const STREAM_TIMEOUT: Duration = Duration::from_secs(60);
const NOT_A_SERVER: &str = "That address isn't a music server. Check the address.";

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: Option<u32>,
    pub track: Option<u32>,
    pub disc_number: Option<u32>,
    pub year: Option<u32>,
    pub genre: String,
    pub cover_art: Option<String>,
    pub suffix: String,
    pub content_type: String,
    pub size: u64,
}

pub struct Scan {
    pub songs: Vec<Song>,
    pub truncated: bool,
}

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())
}

pub fn check_login(server: &Server) -> Result<(), String> {
    if server.username.trim().is_empty() || server.password.is_empty() {
        return Err("Enter the username and password.".to_owned());
    }
    Ok(())
}

pub fn base_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Give the server address.".to_owned());
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_owned()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| "That address isn't valid.".to_owned())?;
    if !matches!(url.scheme(), "https" | "http") {
        return Err("The address must start with https:// or http://.".to_owned());
    }
    if url.host_str().is_none() {
        return Err("That address isn't valid.".to_owned());
    }
    Ok(url)
}

pub fn token(password: &str, salt: &str) -> String {
    format!("{:x}", md5::compute(format!("{password}{salt}")))
}

fn new_salt() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(12)
        .map(char::from)
        .collect()
}

pub fn endpoint(server: &Server, method: &str, params: &[(&str, String)]) -> Result<Url, String> {
    endpoint_with_salt(server, method, params, &new_salt())
}

fn endpoint_with_salt(
    server: &Server,
    method: &str,
    params: &[(&str, String)],
    salt: &str,
) -> Result<Url, String> {
    let mut base = base_url(&server.url)?;
    if !base.path().ends_with('/') {
        let path = format!("{}/", base.path());
        base.set_path(&path);
    }
    let mut url = base
        .join(&format!("rest/{method}.view"))
        .map_err(|_| "That address isn't valid.".to_owned())?;
    let auth = token(&server.password, salt);
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("u", server.username.trim())
            .append_pair("t", &auth)
            .append_pair("s", salt)
            .append_pair("v", API_VERSION)
            .append_pair("c", CLIENT_NAME)
            .append_pair("f", "json");
        for (key, value) in params {
            query.append_pair(key, value);
        }
    }
    Ok(url)
}

fn failure_message(code: u64, message: &str) -> String {
    match code {
        40 => "Wrong username or password.".to_owned(),
        41 => "This server doesn't allow the sign-in Hushio uses.".to_owned(),
        30 => "This server is too old for Hushio.".to_owned(),
        20 => "Hushio is too old for this server.".to_owned(),
        50 => "This account isn't allowed to do that on the server.".to_owned(),
        70 => "The server couldn't find that.".to_owned(),
        _ if message.trim().is_empty() => "The server reported an error.".to_owned(),
        _ => format!("The server said: {}", message.trim()),
    }
}

pub fn envelope(body: &str) -> Result<Value, String> {
    let root: Value = serde_json::from_str(body).map_err(|_| NOT_A_SERVER.to_owned())?;
    let response = root
        .get("subsonic-response")
        .cloned()
        .ok_or_else(|| NOT_A_SERVER.to_owned())?;
    if response.get("status").and_then(Value::as_str) == Some("failed") {
        let code = number(response.pointer("/error/code")).unwrap_or(0);
        let message = response
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or_default();
        return Err(failure_message(code, message));
    }
    Ok(response)
}

fn number(value: Option<&Value>) -> Option<u64> {
    match value? {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
}

fn number32(value: Option<&Value>) -> Option<u32> {
    number(value).and_then(|value| u32::try_from(value).ok())
}

fn scalar(value: &Value, key: &str) -> Option<String> {
    match value.get(key)? {
        Value::String(text) if !text.is_empty() => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn items(value: Option<&Value>) -> Vec<&Value> {
    match value {
        Some(Value::Array(items)) => items.iter().collect(),
        Some(Value::Null) | None => Vec::new(),
        Some(item) => vec![item],
    }
}

pub fn ping_message(response: &Value) -> String {
    let kind = text(response, "type");
    let version = text(response, "serverVersion");
    match (kind.is_empty(), version.is_empty()) {
        (false, false) => format!("Connected to {kind} {version}"),
        (false, true) => format!("Connected to {kind}"),
        _ => "Connected to the music server".to_owned(),
    }
}

pub fn album_ids(response: &Value) -> Vec<String> {
    items(response.pointer("/albumList2/album"))
        .into_iter()
        .filter_map(|album| scalar(album, "id"))
        .collect()
}

fn song_of(value: &Value) -> Option<Song> {
    if value.get("isVideo").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    Some(Song {
        id: scalar(value, "id")?,
        title: text(value, "title"),
        artist: text(value, "artist"),
        album: text(value, "album"),
        duration: number32(value.get("duration")),
        track: number32(value.get("track")),
        disc_number: number32(value.get("discNumber")),
        year: number32(value.get("year")),
        genre: text(value, "genre"),
        cover_art: scalar(value, "coverArt"),
        suffix: text(value, "suffix"),
        content_type: text(value, "contentType"),
        size: number(value.get("size")).unwrap_or(0),
    })
}

pub fn album_songs(response: &Value) -> Vec<Song> {
    items(response.pointer("/album/song"))
        .into_iter()
        .filter_map(song_of)
        .collect()
}

pub fn track_of(server: &Server, song: &Song) -> NetworkTrack {
    NetworkTrack {
        id: super::track_id(&server.id, &song.id),
        server_id: server.id.clone(),
        server_name: server.name.clone(),
        path: song.id.clone(),
        name: song.title.clone(),
        title: song.title.clone(),
        artist: song.artist.clone(),
        album: song.album.clone(),
        size: song.size,
        cover_art: song.cover_art.clone(),
    }
}

pub fn image_type(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        "image/jpeg"
    }
}

fn request_error(error: reqwest::Error) -> String {
    let error = error.without_url();
    if error.is_timeout() {
        return "The server didn't answer in time.".to_owned();
    }
    let mut chain = String::new();
    let mut source = error.source();
    while let Some(cause) = source {
        chain.push_str(&cause.to_string().to_ascii_lowercase());
        chain.push(' ');
        source = cause.source();
    }
    if chain.contains("certificate") || chain.contains("tls") {
        return "The secure connection failed. Check the address and the server's certificate.".to_owned();
    }
    "Couldn't reach the server. Check the address.".to_owned()
}

fn answer_error(status: reqwest::StatusCode) -> String {
    format!("The server answered with {}.", status.as_u16())
}

async fn call(http: &reqwest::Client, server: &Server, method: &str, params: &[(&str, String)]) -> Result<Value, String> {
    let url = endpoint(server, method, params)?;
    let response = http.get(url).send().await.map_err(request_error)?;
    if !response.status().is_success() {
        return Err(answer_error(response.status()));
    }
    let body = response.text().await.map_err(request_error)?;
    envelope(&body)
}

pub async fn ping(http: &reqwest::Client, server: &Server) -> Result<String, String> {
    let response = call(http, server, "ping", &[]).await?;
    Ok(ping_message(&response))
}

pub async fn test(server: &Server) -> Result<String, String> {
    check_login(server)?;
    let http = client()?;
    ping(&http, server).await
}

pub async fn scan(http: &reqwest::Client, server: &Server) -> Result<Scan, String> {
    let mut songs = Vec::new();
    let mut offset = 0;
    loop {
        let page = call(
            http,
            server,
            "getAlbumList2",
            &[
                ("type", "alphabeticalByName".to_owned()),
                ("size", PAGE_SIZE.to_string()),
                ("offset", offset.to_string()),
            ],
        )
        .await?;
        let ids = album_ids(&page);
        let fetched = ids.len();
        for id in ids {
            let album = call(http, server, "getAlbum", &[("id", id)]).await?;
            songs.extend(album_songs(&album));
            if songs.len() > SCAN_CAP {
                songs.truncate(SCAN_CAP);
                return Ok(Scan { songs, truncated: true });
            }
        }
        if fetched < PAGE_SIZE {
            return Ok(Scan { songs, truncated: false });
        }
        offset += fetched;
    }
}

pub async fn stream(
    http: &reqwest::Client,
    server: &Server,
    song_id: &str,
    from: u64,
    to: Option<u64>,
) -> Result<Vec<u8>, String> {
    let url = endpoint(
        server,
        "stream",
        &[("id", song_id.to_owned()), ("format", "raw".to_owned())],
    )?;
    let wanted_range = from > 0 || to.is_some();
    let mut request = http.get(url).timeout(STREAM_TIMEOUT);
    if wanted_range {
        let end = to.map_or_else(String::new, |value| value.to_string());
        request = request.header("Range", format!("bytes={from}-{end}"));
    }
    let response = request.send().await.map_err(request_error)?;
    let status = response.status();
    if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        return Ok(Vec::new());
    }
    if !status.is_success() {
        return Err(answer_error(status));
    }
    let partial = status == reqwest::StatusCode::PARTIAL_CONTENT;
    let bytes = response.bytes().await.map_err(request_error)?;
    if !wanted_range || partial {
        return Ok(bytes.to_vec());
    }
    let start = usize::try_from(from).unwrap_or(usize::MAX).min(bytes.len());
    let end = to.map_or(bytes.len(), |value| {
        usize::try_from(value.saturating_add(1))
            .unwrap_or(usize::MAX)
            .min(bytes.len())
    });
    Ok(bytes[start..end.max(start)].to_vec())
}

pub async fn cover(http: &reqwest::Client, server: &Server, cover_id: &str) -> Result<Vec<u8>, String> {
    let url = endpoint(
        server,
        "getCoverArt",
        &[("id", cover_id.to_owned()), ("size", "600".to_owned())],
    )?;
    let response = http.get(url).send().await.map_err(request_error)?;
    if !response.status().is_success() {
        return Err(answer_error(response.status()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if content_type.is_empty() || content_type.contains("json") || content_type.contains("xml") {
        return Err("The server has no cover for that song.".to_owned());
    }
    Ok(response.bytes().await.map_err(request_error)?.to_vec())
}

#[cfg(test)]
pub mod mock_server {
    use std::collections::HashMap;
    use std::sync::Arc;

    use axum::extract::{Query, State};
    use axum::http::{header, HeaderMap};
    use axum::response::{IntoResponse, Response};
    use axum::routing::get;
    use axum::Router;

    use super::token;

    pub const PASSWORD: &str = "hunter2";
    pub const AUDIO: &[u8] = b"0123456789abcdefghij";
    pub const COVER: &[u8] = &[0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];

    pub struct Library {
        pub albums: usize,
        pub songs_per_album: usize,
    }

    type Params = Query<HashMap<String, String>>;

    fn authorised(params: &HashMap<String, String>) -> bool {
        let salt = params.get("s").cloned().unwrap_or_default();
        params.get("u").map(String::as_str) == Some("me")
            && params.get("t") == Some(&token(PASSWORD, &salt))
    }

    fn json(body: String) -> Response {
        ([(header::CONTENT_TYPE, "application/json")], body).into_response()
    }

    fn refused() -> Response {
        json(r#"{"subsonic-response":{"status":"failed","version":"1.16.1","error":{"code":40,"message":"Wrong username or password."}}}"#.to_owned())
    }

    async fn ping(Query(params): Params) -> Response {
        if !authorised(&params) {
            return refused();
        }
        json(r#"{"subsonic-response":{"status":"ok","version":"1.16.1","type":"navidrome","serverVersion":"0.53.3"}}"#.to_owned())
    }

    async fn album_list(State(library): State<Arc<Library>>, Query(params): Params) -> Response {
        if !authorised(&params) {
            return refused();
        }
        let offset: usize = params.get("offset").and_then(|value| value.parse().ok()).unwrap_or(0);
        let size: usize = params.get("size").and_then(|value| value.parse().ok()).unwrap_or(10);
        let end = (offset + size).min(library.albums);
        let albums: Vec<String> = (offset..end)
            .map(|index| format!(r#"{{"id":"al-{index}","name":"Album {index}","artist":"Nova"}}"#))
            .collect();
        json(format!(
            r#"{{"subsonic-response":{{"status":"ok","version":"1.16.1","albumList2":{{"album":[{}]}}}}}}"#,
            albums.join(",")
        ))
    }

    async fn album(State(library): State<Arc<Library>>, Query(params): Params) -> Response {
        if !authorised(&params) {
            return refused();
        }
        let id = params.get("id").cloned().unwrap_or_default();
        let index = id.trim_start_matches("al-");
        let songs: Vec<String> = (0..library.songs_per_album)
            .map(|track| {
                format!(
                    r#"{{"id":"s-{index}-{track}","title":"Song {track}","artist":"Nova","album":"Album {index}","track":{},"coverArt":"{id}","size":20,"contentType":"audio/mpeg","suffix":"mp3","duration":180}}"#,
                    track + 1
                )
            })
            .collect();
        let body = if songs.len() == 1 {
            format!(r#"{{"subsonic-response":{{"status":"ok","version":"1.16.1","album":{{"id":"{id}","song":{}}}}}}}"#, songs[0])
        } else {
            format!(r#"{{"subsonic-response":{{"status":"ok","version":"1.16.1","album":{{"id":"{id}","song":[{}]}}}}}}"#, songs.join(","))
        };
        json(body)
    }

    async fn stream(Query(params): Params, headers: HeaderMap) -> Response {
        if !authorised(&params) {
            return refused();
        }
        let range = headers
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("bytes="))
            .and_then(|value| value.split_once('-'))
            .map(|(from, to)| {
                let from: usize = from.parse().unwrap_or(0);
                let to: usize = to.parse().unwrap_or(AUDIO.len() - 1);
                (from, to.min(AUDIO.len() - 1))
            });
        match range {
            Some((from, to)) => (
                axum::http::StatusCode::PARTIAL_CONTENT,
                [(header::CONTENT_RANGE, format!("bytes {from}-{to}/{}", AUDIO.len()))],
                AUDIO[from..=to].to_vec(),
            )
                .into_response(),
            None => (
                [(header::CONTENT_TYPE, "audio/mpeg")],
                AUDIO.to_vec(),
            )
                .into_response(),
        }
    }

    async fn cover(Query(params): Params) -> Response {
        if !authorised(&params) {
            return refused();
        }
        ([(header::CONTENT_TYPE, "image/jpeg")], COVER.to_vec()).into_response()
    }

    pub async fn serve(library: Library) -> String {
        let app = Router::new()
            .route("/rest/ping.view", get(ping))
            .route("/rest/getAlbumList2.view", get(album_list))
            .route("/rest/getAlbum.view", get(album))
            .route("/rest/stream.view", get(stream))
            .route("/rest/getCoverArt.view", get(cover))
            .with_state(Arc::new(library));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{address}")
    }
}

#[cfg(test)]
mod tests {
    use super::mock_server::{self, Library, AUDIO, COVER, PASSWORD};
    use super::*;

    fn server(url: &str, password: &str) -> Server {
        Server {
            id: "abc123".to_owned(),
            kind: super::super::ServerKind::Subsonic,
            name: "Home".to_owned(),
            url: url.to_owned(),
            host: String::new(),
            share: String::new(),
            path: String::new(),
            username: "me".to_owned(),
            password: password.to_owned(),
            scanned_at: 0,
            song_count: 0,
            truncated: false,
        }
    }

    const PING_OK: &str = r#"{"subsonic-response":{"status":"ok","version":"1.16.1","type":"navidrome","serverVersion":"0.53.3","openSubsonic":true}}"#;
    const WRONG_LOGIN: &str = r#"{"subsonic-response":{"status":"failed","version":"1.16.1","error":{"code":40,"message":"Wrong username or password."}}}"#;
    const TOO_OLD: &str = r#"{"subsonic-response":{"status":"failed","version":"1.8.0","error":{"code":30,"message":"Incompatible Subsonic REST protocol version. Server must upgrade."}}}"#;
    const ALBUMS_ONE: &str = r#"{"subsonic-response":{"status":"ok","version":"1.16.1","albumList2":{"album":{"id":"al-7","name":"Only Album","artist":"Nova","songCount":2}}}}"#;
    const ALBUMS_TWO: &str = r#"{"subsonic-response":{"status":"ok","version":"1.16.1","albumList2":{"album":[{"id":"al-1","name":"One"},{"id":"al-2","name":"Two"}]}}}"#;
    const ALBUM_SINGLE_SONG: &str = r#"{"subsonic-response":{"status":"ok","version":"1.16.1","album":{"id":"al-7","name":"Only Album","artist":"Nova","year":2019,"song":{"id":"501","parent":"al-7","title":"Great Song","album":"Only Album","artist":"Nova","track":1,"discNumber":1,"year":2019,"genre":"Pop","coverArt":"al-7","size":4123456,"contentType":"audio/flac","suffix":"flac","duration":215,"isVideo":false}}}}"#;
    const ALBUM_TWO_SONGS: &str = r#"{"subsonic-response":{"status":"ok","version":"1.16.1","album":{"id":"al-1","name":"One","song":[{"id":"601","title":"Alpha","artist":"Nova","album":"One","track":1,"coverArt":"al-1","size":900,"contentType":"audio/mpeg","suffix":"mp3","duration":180},{"id":"602","title":"Beta","artist":"Nova","album":"One","track":2,"size":1100,"contentType":"audio/mpeg","suffix":"mp3","duration":200,"isVideo":true}]}}}"#;

    #[test]
    fn the_token_is_the_md5_of_the_password_and_salt() {
        assert_eq!(token("sesame", "c19b2d"), "26719a1196d2a940705a59634eb18eab");
    }

    #[test]
    fn the_request_url_carries_a_token_and_never_the_password() {
        let url = endpoint_with_salt(&server("https://music.example", "hunter2"), "ping", &[], "c19b2d").unwrap();
        let text = url.as_str();
        assert!(text.starts_with("https://music.example/rest/ping.view?"));
        assert!(text.contains("u=me"));
        assert!(text.contains(&format!("t={}", token("hunter2", "c19b2d"))));
        assert!(text.contains("s=c19b2d"));
        assert!(text.contains("v=1.16.1"));
        assert!(text.contains("c=Hushio"));
        assert!(text.contains("f=json"));
        assert!(!text.contains("hunter2"));
    }

    #[test]
    fn a_base_path_keeps_its_folders_and_a_missing_scheme_means_https() {
        let url = endpoint_with_salt(&server("music.example/navidrome", "p"), "getAlbum", &[("id", "al-1".to_owned())], "s").unwrap();
        assert!(url.as_str().starts_with("https://music.example/navidrome/rest/getAlbum.view?"));
        assert!(url.as_str().contains("id=al-1"));
    }

    #[test]
    fn only_http_and_https_addresses_are_accepted() {
        assert!(base_url("http://192.168.1.5:4533").is_ok());
        assert!(base_url("https://music.example").is_ok());
        assert_eq!(base_url("   ").unwrap_err(), "Give the server address.");
        assert!(base_url("ftp://music.example").is_err());
    }

    #[test]
    fn a_ping_names_the_server_type_and_version() {
        assert_eq!(envelope(PING_OK).map(|r| ping_message(&r)).unwrap(), "Connected to navidrome 0.53.3");
    }

    #[test]
    fn a_wrong_password_is_reported_plainly() {
        assert_eq!(envelope(WRONG_LOGIN).unwrap_err(), "Wrong username or password.");
    }

    #[test]
    fn an_old_server_is_reported_as_too_old() {
        assert_eq!(envelope(TOO_OLD).unwrap_err(), "This server is too old for Hushio.");
    }

    #[test]
    fn a_page_that_is_not_subsonic_is_an_address_problem() {
        assert_eq!(envelope("<html>hello</html>").unwrap_err(), NOT_A_SERVER);
        assert_eq!(envelope(r#"{"other":1}"#).unwrap_err(), NOT_A_SERVER);
    }

    #[test]
    fn a_single_album_object_is_read_as_one_album() {
        assert_eq!(album_ids(&envelope(ALBUMS_ONE).unwrap()), vec!["al-7".to_owned()]);
        assert_eq!(album_ids(&envelope(ALBUMS_TWO).unwrap()), vec!["al-1".to_owned(), "al-2".to_owned()]);
    }

    #[test]
    fn a_single_song_object_is_read_as_one_song() {
        let songs = album_songs(&envelope(ALBUM_SINGLE_SONG).unwrap());
        assert_eq!(songs.len(), 1);
        assert_eq!(songs[0].id, "501");
        assert_eq!(songs[0].duration, Some(215));
        assert_eq!(songs[0].disc_number, Some(1));
        assert_eq!(songs[0].cover_art.as_deref(), Some("al-7"));
        assert_eq!(songs[0].content_type, "audio/flac");
    }

    #[test]
    fn video_songs_are_left_out_of_the_library() {
        let songs = album_songs(&envelope(ALBUM_TWO_SONGS).unwrap());
        let ids: Vec<&str> = songs.iter().map(|song| song.id.as_str()).collect();
        assert_eq!(ids, vec!["601"]);
    }

    #[test]
    fn a_track_id_is_the_server_id_and_the_song_id() {
        let song = album_songs(&envelope(ALBUM_SINGLE_SONG).unwrap()).remove(0);
        let first = track_of(&server("https://music.example", "p"), &song);
        let second = track_of(&server("https://music.example", "other"), &song);
        assert_eq!(first.id, "net:abc123:501");
        assert_eq!(first.id, second.id);
        assert!(!format!("{first:?}").contains("other"));
    }

    #[test]
    fn an_image_is_labelled_by_its_first_bytes() {
        assert_eq!(image_type(&[0x89, b'P', b'N', b'G', 0]), "image/png");
        assert_eq!(image_type(b"RIFF1234WEBPdata"), "image/webp");
        assert_eq!(image_type(&[0xff, 0xd8, 0xff]), "image/jpeg");
    }

    fn mock(url: String, password: &str) -> Server {
        server(&url, password)
    }

    #[tokio::test]
    async fn a_ping_against_a_server_names_it() {
        let url = mock_server::serve(Library { albums: 0, songs_per_album: 0 }).await;
        let http = client().unwrap();
        assert_eq!(ping(&http, &mock(url, PASSWORD)).await.unwrap(), "Connected to navidrome 0.53.3");
    }

    #[tokio::test]
    async fn a_wrong_password_gives_the_plain_message() {
        let url = mock_server::serve(Library { albums: 0, songs_per_album: 0 }).await;
        let http = client().unwrap();
        assert_eq!(ping(&http, &mock(url, "wrong")).await.unwrap_err(), "Wrong username or password.");
    }

    #[tokio::test]
    async fn an_address_nothing_answers_on_gives_a_short_message_without_the_password() {
        let http = client().unwrap();
        let error = ping(&http, &mock("http://127.0.0.1:1".to_owned(), PASSWORD)).await.unwrap_err();
        assert_eq!(error, "Couldn't reach the server. Check the address.");
        assert!(!error.contains(PASSWORD));
    }

    #[tokio::test]
    async fn a_scan_reads_every_album_across_pages() {
        let url = mock_server::serve(Library { albums: 501, songs_per_album: 1 }).await;
        let http = client().unwrap();
        let scan = scan(&http, &mock(url, PASSWORD)).await.unwrap();
        assert_eq!(scan.songs.len(), 501);
        assert!(!scan.truncated);
        assert_eq!(scan.songs[0].id, "s-0-0");
        assert_eq!(scan.songs[500].id, "s-500-0");
    }

    #[tokio::test]
    async fn a_scan_stops_at_twenty_thousand_songs_and_says_so() {
        let url = mock_server::serve(Library { albums: 21, songs_per_album: 1000 }).await;
        let http = client().unwrap();
        let scan = scan(&http, &mock(url, PASSWORD)).await.unwrap();
        assert_eq!(scan.songs.len(), SCAN_CAP);
        assert!(scan.truncated);
    }

    #[tokio::test]
    async fn a_stream_with_a_range_returns_only_that_range() {
        let url = mock_server::serve(Library { albums: 0, songs_per_album: 0 }).await;
        let http = client().unwrap();
        let bytes = stream(&http, &mock(url, PASSWORD), "s-1-0", 2, Some(5)).await.unwrap();
        assert_eq!(bytes, AUDIO[2..=5].to_vec());
    }

    #[tokio::test]
    async fn a_stream_without_a_range_returns_the_whole_file() {
        let url = mock_server::serve(Library { albums: 0, songs_per_album: 0 }).await;
        let http = client().unwrap();
        let bytes = stream(&http, &mock(url, PASSWORD), "s-1-0", 0, None).await.unwrap();
        assert_eq!(bytes, AUDIO.to_vec());
    }

    #[tokio::test]
    async fn a_cover_comes_back_as_image_bytes() {
        let url = mock_server::serve(Library { albums: 0, songs_per_album: 0 }).await;
        let http = client().unwrap();
        assert_eq!(cover(&http, &mock(url, PASSWORD), "al-1").await.unwrap(), COVER.to_vec());
    }
}

use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Datelike, NaiveDate, TimeDelta, Utc};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::google_auth::{GoogleAuth, TokenError};

pub const API_BASE: &str = "https://www.googleapis.com/youtube/v3";
pub const QUOTA_LIMIT: i64 = 10_000;
const PAGE_SIZE: &str = "50";
const VIDEO_BATCH: usize = 50;
const UNAVAILABLE_TITLES: [&str; 2] = ["Deleted video", "Private video"];
const TITLE_MAX_CHARS: usize = 150;
const READ_UNITS: i64 = 1;
const WRITE_UNITS: i64 = 50;
const HTTP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

pub trait AccessTokens: Send + Sync {
    fn token(&self, force: bool) -> impl Future<Output = Result<String, TokenError>> + Send;
}

impl AccessTokens for GoogleAuth {
    fn token(&self, force: bool) -> impl Future<Output = Result<String, TokenError>> + Send {
        self.youtube_token(force)
    }
}

impl<T: AccessTokens> AccessTokens for Arc<T> {
    fn token(&self, force: bool) -> impl Future<Output = Result<String, TokenError>> + Send {
        (**self).token(force)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum ApiError {
    Token(TokenError),
    Status {
        status: u16,
        reason: Option<String>,
        message: String,
    },
    Network(String),
}

impl ApiError {
    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Status { status, .. } => Some(*status),
            _ => None,
        }
    }

    pub fn is_quota(&self) -> bool {
        matches!(self, Self::Status { reason: Some(reason), .. } if reason == "quotaExceeded")
    }

    pub fn describe(&self) -> String {
        match self {
            Self::Token(_) => "Google sign-in is needed.".to_owned(),
            Self::Status { status, message, .. } if message.is_empty() => {
                format!("YouTube returned {status}.")
            }
            Self::Status { message, .. } => message.clone(),
            Self::Network(_) => "Couldn't reach YouTube.".to_owned(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quota {
    pub day: String,
    pub units: i64,
    #[serde(default)]
    pub fallback: bool,
}

impl Quota {
    pub fn charge(&mut self, units: i64, now: i64) {
        self.roll(now);
        self.units += units;
    }

    pub fn switch_to_fallback(&mut self, now: i64) {
        self.roll(now);
        self.units = QUOTA_LIMIT;
        self.fallback = true;
    }

    pub fn on_fallback(&mut self, now: i64) -> bool {
        self.roll(now);
        self.fallback
    }

    pub fn used(&mut self, now: i64) -> i64 {
        self.roll(now);
        self.units
    }

    fn roll(&mut self, now: i64) {
        let day = pacific_day(now);
        if self.day != day {
            self.day = day;
            self.units = 0;
            self.fallback = false;
        }
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

pub fn pacific_day(now_ms: i64) -> String {
    let utc = DateTime::<Utc>::from_timestamp_millis(now_ms).unwrap_or(DateTime::<Utc>::UNIX_EPOCH);
    let offset = if pacific_daylight(utc) { -7 } else { -8 };
    (utc + TimeDelta::hours(offset)).format("%Y-%m-%d").to_string()
}

fn pacific_daylight(utc: DateTime<Utc>) -> bool {
    let year = utc.year();
    let start = nth_sunday(year, 3, 2).and_hms_opt(10, 0, 0).unwrap_or_default().and_utc();
    let end = nth_sunday(year, 11, 1).and_hms_opt(9, 0, 0).unwrap_or_default().and_utc();
    utc >= start && utc < end
}

fn nth_sunday(year: i32, month: u32, nth: i64) -> NaiveDate {
    let first = NaiveDate::from_ymd_opt(year, month, 1).unwrap_or_default();
    let to_sunday = (7 - i64::from(first.weekday().num_days_from_sunday())) % 7;
    first + TimeDelta::days(to_sunday + 7 * (nth - 1))
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteItem {
    pub item_id: String,
    pub video_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlaylist {
    pub id: String,
    pub title: String,
    pub count: u64,
    pub thumbnail: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVideo {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub duration_seconds: Option<u32>,
    pub thumbnail: Option<String>,
}

fn is_playable(item: &Value) -> bool {
    let title = item["snippet"]["title"].as_str().unwrap_or_default();
    !str_at(&item["snippet"]["resourceId"], "videoId").is_empty() && !UNAVAILABLE_TITLES.contains(&title)
}

fn owner_of(snippet: &Value) -> String {
    let owner = str_at(snippet, "videoOwnerChannelTitle");
    if owner.is_empty() {
        str_at(snippet, "channelTitle")
    } else {
        owner
    }
}

fn thumbnail_of(snippet: &Value) -> Option<String> {
    ["medium", "default"]
        .iter()
        .find_map(|size| snippet["thumbnails"][*size]["url"].as_str())
        .map(str::to_owned)
}

fn parse_duration(text: &str) -> Option<u32> {
    let time = text.strip_prefix("PT")?;
    let mut total: u32 = 0;
    let mut number: u32 = 0;
    for ch in time.chars() {
        if let Some(digit) = ch.to_digit(10) {
            number = number.checked_mul(10)?.checked_add(digit)?;
            continue;
        }
        let unit = match ch {
            'H' => 3600,
            'M' => 60,
            'S' => 1,
            _ => return None,
        };
        total = total.checked_add(number.checked_mul(unit)?)?;
        number = 0;
    }
    Some(total)
}

pub struct YtApi {
    http: reqwest::Client,
    base: String,
    quota: Arc<Mutex<Quota>>,
}

impl YtApi {
    pub fn new(base: &str, quota: Arc<Mutex<Quota>>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(crate::stream::USER_AGENT)
            .timeout(HTTP_TIMEOUT)
            .build()
            .unwrap_or_default();
        Self {
            http,
            base: base.trim_end_matches('/').to_owned(),
            quota,
        }
    }

    pub async fn list_playlists<T: AccessTokens>(&self, tokens: &T) -> Result<Vec<Value>, ApiError> {
        let mut out = Vec::new();
        self.pages(
            tokens,
            "playlists",
            &[("part", "snippet,contentDetails,status"), ("mine", "true")],
            &mut out,
        )
        .await?;
        Ok(out)
    }

    pub async fn list_items<T: AccessTokens>(
        &self,
        tokens: &T,
        playlist_id: &str,
    ) -> Result<Vec<RemoteItem>, ApiError> {
        let mut raw = Vec::new();
        self.pages(
            tokens,
            "playlistItems",
            &[("part", "snippet,contentDetails"), ("playlistId", playlist_id)],
            &mut raw,
        )
        .await?;
        Ok(raw
            .iter()
            .map(|item| RemoteItem {
                item_id: str_at(item, "id"),
                video_id: str_at(&item["snippet"]["resourceId"], "videoId"),
            })
            .collect())
    }

    pub async fn my_playlists<T: AccessTokens>(&self, tokens: &T) -> Result<Vec<RemotePlaylist>, ApiError> {
        let raw = self.list_playlists(tokens).await?;
        Ok(raw
            .iter()
            .map(|item| RemotePlaylist {
                id: str_at(item, "id"),
                title: str_at(&item["snippet"], "title"),
                count: item["contentDetails"]["itemCount"].as_u64().unwrap_or(0),
                thumbnail: thumbnail_of(&item["snippet"]),
            })
            .collect())
    }

    pub async fn playlist_videos<T: AccessTokens>(
        &self,
        tokens: &T,
        playlist_id: &str,
    ) -> Result<Vec<RemoteVideo>, ApiError> {
        self.videos(tokens, &[("playlistId", playlist_id)]).await
    }

    pub async fn liked_videos<T: AccessTokens>(
        &self,
        tokens: &T,
    ) -> Result<Vec<RemoteVideo>, ApiError> {
        self.videos(tokens, &[("myRating", "like")]).await
    }

    async fn videos<T: AccessTokens>(
        &self,
        tokens: &T,
        filter: &[(&str, &str)],
    ) -> Result<Vec<RemoteVideo>, ApiError> {
        let mut raw = Vec::new();
        let mut query = vec![("part", "snippet,contentDetails")];
        query.extend_from_slice(filter);
        self.pages(
            tokens,
            "playlistItems",
            &query,
            &mut raw,
        )
        .await?;
        let playable: Vec<&Value> = raw.iter().filter(|item| is_playable(item)).collect();
        let ids: Vec<String> = playable
            .iter()
            .map(|item| str_at(&item["snippet"]["resourceId"], "videoId"))
            .collect();
        let durations = self.durations(tokens, &ids).await?;
        Ok(playable
            .into_iter()
            .zip(ids)
            .map(|(item, video_id)| RemoteVideo {
                duration_seconds: durations.get(&video_id).copied(),
                title: str_at(&item["snippet"], "title"),
                artist: owner_of(&item["snippet"]),
                thumbnail: thumbnail_of(&item["snippet"]),
                video_id,
            })
            .collect())
    }

    async fn durations<T: AccessTokens>(&self, tokens: &T, ids: &[String]) -> Result<HashMap<String, u32>, ApiError> {
        let mut out = HashMap::new();
        for chunk in ids.chunks(VIDEO_BATCH) {
            let joined = chunk.join(",");
            let reply = self
                .send(
                    tokens,
                    Method::GET,
                    "videos",
                    &[("part", "contentDetails"), ("id", joined.as_str())],
                    None,
                )
                .await?;
            for item in reply["items"].as_array().into_iter().flatten() {
                let text = item["contentDetails"]["duration"].as_str().unwrap_or_default();
                if let Some(seconds) = parse_duration(text) {
                    out.insert(str_at(item, "id"), seconds);
                }
            }
        }
        Ok(out)
    }

    pub async fn create_playlist<T: AccessTokens>(&self, tokens: &T, title: &str) -> Result<String, ApiError> {
        let body = json!({
            "snippet": { "title": clip_title(title) },
            "status": { "privacyStatus": "private" },
        });
        let reply = self
            .send(tokens, Method::POST, "playlists", &[("part", "snippet,status")], Some(&body))
            .await?;
        Ok(str_at(&reply, "id"))
    }

    pub async fn rename_playlist<T: AccessTokens>(
        &self,
        tokens: &T,
        playlist_id: &str,
        title: &str,
    ) -> Result<(), ApiError> {
        let body = json!({ "id": playlist_id, "snippet": { "title": clip_title(title) } });
        self.send(tokens, Method::PUT, "playlists", &[("part", "snippet")], Some(&body))
            .await
            .map(|_| ())
    }

    pub async fn delete_playlist<T: AccessTokens>(&self, tokens: &T, playlist_id: &str) -> Result<(), ApiError> {
        self.send(tokens, Method::DELETE, "playlists", &[("id", playlist_id)], None)
            .await
            .map(|_| ())
    }

    pub async fn add_item<T: AccessTokens>(
        &self,
        tokens: &T,
        playlist_id: &str,
        video_id: &str,
    ) -> Result<(), ApiError> {
        let body = json!({
            "snippet": {
                "playlistId": playlist_id,
                "resourceId": { "kind": "youtube#video", "videoId": video_id },
            },
        });
        self.send(tokens, Method::POST, "playlistItems", &[("part", "snippet")], Some(&body))
            .await
            .map(|_| ())
    }

    pub async fn remove_item<T: AccessTokens>(&self, tokens: &T, item_id: &str) -> Result<(), ApiError> {
        self.send(tokens, Method::DELETE, "playlistItems", &[("id", item_id)], None)
            .await
            .map(|_| ())
    }

    pub async fn rate<T: AccessTokens>(&self, tokens: &T, video_id: &str, like: bool) -> Result<(), ApiError> {
        let rating = if like { "like" } else { "none" };
        self.send(tokens, Method::POST, "videos/rate", &[("id", video_id), ("rating", rating)], None)
            .await
            .map(|_| ())
    }

    async fn pages<T: AccessTokens>(
        &self,
        tokens: &T,
        path: &str,
        fixed: &[(&str, &str)],
        out: &mut Vec<Value>,
    ) -> Result<(), ApiError> {
        let mut page: Option<String> = None;
        loop {
            let mut query = fixed.to_vec();
            query.push(("maxResults", PAGE_SIZE));
            if let Some(token) = page.as_deref() {
                query.push(("pageToken", token));
            }
            let reply = self.send(tokens, Method::GET, path, &query, None).await?;
            if let Some(items) = reply["items"].as_array() {
                out.extend(items.iter().cloned());
            }
            match reply["nextPageToken"].as_str() {
                Some(next) => page = Some(next.to_owned()),
                None => return Ok(()),
            }
        }
    }

    async fn send<T: AccessTokens>(
        &self,
        tokens: &T,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<Value, ApiError> {
        let token = tokens.token(false).await.map_err(ApiError::Token)?;
        let mut reply = self.dispatch(&method, path, query, body, &token).await?;
        if reply.0 == 401 {
            let token = tokens.token(true).await.map_err(ApiError::Token)?;
            reply = self.dispatch(&method, path, query, body, &token).await?;
            if reply.0 == 401 {
                return Err(ApiError::Token(TokenError::SignedOut));
            }
        }
        interpret(reply.0, &reply.1)
    }

    async fn dispatch(
        &self,
        method: &Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<&Value>,
        token: &str,
    ) -> Result<(u16, String), ApiError> {
        let units = if *method == Method::GET { READ_UNITS } else { WRITE_UNITS };
        if let Ok(mut quota) = self.quota.lock() {
            quota.charge(units, now_ms());
        }
        let mut request = self
            .http
            .request(method.clone(), format!("{}/{path}", self.base))
            .bearer_auth(token)
            .query(query);
        if let Some(body) = body {
            request = request.json(body);
        }
        let response = request
            .send()
            .await
            .map_err(|error| ApiError::Network(error.to_string()))?;
        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|error| ApiError::Network(error.to_string()))?;
        Ok((status, text))
    }
}

pub(crate) fn interpret(status: u16, text: &str) -> Result<Value, ApiError> {
    if (200..300).contains(&status) {
        return Ok(serde_json::from_str(text).unwrap_or(Value::Null));
    }
    let value: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let error = &value["error"];
    Err(ApiError::Status {
        status,
        reason: error["errors"][0]["reason"].as_str().map(str::to_owned),
        message: error["message"].as_str().unwrap_or_default().to_owned(),
    })
}

fn str_at(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_default().to_owned()
}

pub fn is_video_id(id: &str) -> bool {
    id.len() == 11 && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

pub(crate) fn clip_title(title: &str) -> String {
    title.chars().take(TITLE_MAX_CHARS).collect()
}

#[cfg(test)]
pub mod test_support {
    use super::*;
    use std::collections::VecDeque;

    use axum::Router;
    use axum::extract::{Request, State};
    use axum::http::StatusCode;
    use axum::routing::any;
    use tokio::net::TcpListener;

    #[derive(Clone, Debug, PartialEq, Eq)]
    pub struct Seen {
        pub method: String,
        pub path: String,
        pub query: String,
        pub body: String,
    }

    #[derive(Default)]
    pub struct Mock {
        pub seen: Mutex<Vec<Seen>>,
        pub replies: Mutex<VecDeque<(u16, String)>>,
    }

    async fn handle(State(mock): State<Arc<Mock>>, request: Request) -> (StatusCode, String) {
        let (parts, body) = request.into_parts();
        let body = axum::body::to_bytes(body, usize::MAX).await.unwrap_or_default();
        mock.seen.lock().unwrap().push(Seen {
            method: parts.method.to_string(),
            path: parts.uri.path().to_owned(),
            query: parts.uri.query().unwrap_or_default().to_owned(),
            body: String::from_utf8_lossy(&body).into_owned(),
        });
        let (status, text) = mock
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or((200, "{}".to_owned()));
        (StatusCode::from_u16(status).unwrap_or(StatusCode::OK), text)
    }

    pub async fn start_mock() -> (String, Arc<Mock>) {
        let mock = Arc::new(Mock::default());
        let app = Router::new().fallback(any(handle)).with_state(mock.clone());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}/youtube/v3", listener.local_addr().unwrap());
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (base, mock)
    }

    pub struct FakeTokens;

    impl AccessTokens for FakeTokens {
        fn token(&self, _force: bool) -> impl Future<Output = Result<String, TokenError>> + Send {
            std::future::ready(Ok("token-1".to_owned()))
        }
    }

    pub fn quota() -> Arc<Mutex<Quota>> {
        Arc::new(Mutex::new(Quota::default()))
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;

    #[tokio::test]
    async fn create_playlist_asks_for_a_private_playlist() {
        let (base, mock) = start_mock().await;
        mock.replies
            .lock()
            .unwrap()
            .push_back((200, r#"{"id":"PLnew"}"#.to_owned()));
        let api = YtApi::new(&base, quota());
        let id = api.create_playlist(&FakeTokens, "Road trip").await.unwrap();
        assert_eq!(id, "PLnew");
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].method, "POST");
        assert_eq!(seen[0].path, "/youtube/v3/playlists");
        assert_eq!(seen[0].query, "part=snippet%2Cstatus");
        let body: Value = serde_json::from_str(&seen[0].body).unwrap();
        assert_eq!(body["snippet"]["title"], "Road trip");
        assert_eq!(body["status"]["privacyStatus"], "private");
    }

    #[tokio::test]
    async fn titles_are_cut_to_150_characters() {
        let (base, mock) = start_mock().await;
        let api = YtApi::new(&base, quota());
        let long = "a".repeat(200);
        api.create_playlist(&FakeTokens, &long).await.unwrap();
        let body: Value = serde_json::from_str(&mock.seen.lock().unwrap()[0].body).unwrap();
        assert_eq!(body["snippet"]["title"].as_str().unwrap().chars().count(), 150);
    }

    #[tokio::test]
    async fn paging_follows_next_page_token_and_charges_one_unit_per_page() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[{"id":"PL1","snippet":{"title":"A"},"contentDetails":{"itemCount":3}}],"nextPageToken":"next"}"#
                .to_owned(),
        ));
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[{"id":"PL2","snippet":{"title":"B"},"contentDetails":{"itemCount":0}}]}"#.to_owned(),
        ));
        let counter = quota();
        let api = YtApi::new(&base, counter.clone());
        let items = api.list_playlists(&FakeTokens).await.unwrap();
        assert_eq!(items.len(), 2);
        let seen = mock.seen.lock().unwrap().clone();
        assert!(seen[1].query.contains("pageToken=next"));
        assert_eq!(counter.lock().unwrap().units, 2);
    }

    #[tokio::test]
    async fn my_playlists_maps_count_and_thumbnail() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[{"id":"PL1","snippet":{"title":"Road","thumbnails":{"medium":{"url":"https://img/m.jpg"},"default":{"url":"https://img/d.jpg"}}},"contentDetails":{"itemCount":12}}]}"#
                .to_owned(),
        ));
        let api = YtApi::new(&base, quota());
        let playlists = api.my_playlists(&FakeTokens).await.unwrap();
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].id, "PL1");
        assert_eq!(playlists[0].title, "Road");
        assert_eq!(playlists[0].count, 12);
        assert_eq!(playlists[0].thumbnail.as_deref(), Some("https://img/m.jpg"));
    }

    #[tokio::test]
    async fn playlist_videos_follow_paging_skip_deleted_and_private_videos_and_read_durations() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[
                {"snippet":{"title":"Song one","videoOwnerChannelTitle":"Band A","resourceId":{"videoId":"v1"},"thumbnails":{"default":{"url":"https://img/1.jpg"}}}},
                {"snippet":{"title":"Deleted video","resourceId":{"videoId":"gone"}}}
            ],"nextPageToken":"next"}"#
                .to_owned(),
        ));
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[
                {"snippet":{"title":"Private video","resourceId":{"videoId":"hidden"}}},
                {"snippet":{"title":"Song two","channelTitle":"Band B","resourceId":{"videoId":"v2"}}}
            ]}"#
                .to_owned(),
        ));
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[
                {"id":"v1","contentDetails":{"duration":"PT4M13S"}},
                {"id":"v2","contentDetails":{"duration":"PT1H2M3S"}}
            ]}"#
                .to_owned(),
        ));
        let counter = quota();
        let api = YtApi::new(&base, counter.clone());
        let videos = api.playlist_videos(&FakeTokens, "PL9").await.unwrap();
        let ids: Vec<&str> = videos.iter().map(|video| video.video_id.as_str()).collect();
        assert_eq!(ids, ["v1", "v2"]);
        assert_eq!(videos[0].title, "Song one");
        assert_eq!(videos[0].artist, "Band A");
        assert_eq!(videos[0].duration_seconds, Some(253));
        assert_eq!(videos[0].thumbnail.as_deref(), Some("https://img/1.jpg"));
        assert_eq!(videos[1].artist, "Band B");
        assert_eq!(videos[1].duration_seconds, Some(3723));
        assert_eq!(videos[1].thumbnail, None);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 3);
        assert!(seen[0].query.contains("playlistId=PL9"));
        assert!(seen[1].query.contains("pageToken=next"));
        assert_eq!(seen[2].path, "/youtube/v3/videos");
        assert_eq!(counter.lock().unwrap().units, 3);
    }

    #[tokio::test]
    async fn playlist_with_only_unavailable_videos_skips_the_duration_lookup() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[{"snippet":{"title":"Deleted video","resourceId":{"videoId":"gone"}}}]}"#.to_owned(),
        ));
        let api = YtApi::new(&base, quota());
        assert!(api.playlist_videos(&FakeTokens, "PL9").await.unwrap().is_empty());
        assert_eq!(mock.seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn liked_videos_follow_every_page_and_skip_unavailable_items() {
        let (base, mock) = start_mock().await;
        let first = (0..50)
            .map(|index| {
                format!(
                    r#"{{"snippet":{{"title":"Song {index}","videoOwnerChannelTitle":"Artist","resourceId":{{"videoId":"v{index:010}"}}}}}}"#
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        mock.replies.lock().unwrap().push_back((
            200,
            format!(r#"{{"items":[{first}],"nextPageToken":"next"}}"#),
        ));
        mock.replies.lock().unwrap().push_back((
            200,
            r#"{"items":[{"snippet":{"title":"Deleted video","resourceId":{"videoId":"gone"}}},{"snippet":{"title":"Song 50","resourceId":{"videoId":"v0000000050"}}}]}"#.to_owned(),
        ));
        for _ in 0..2 {
            mock.replies
                .lock()
                .unwrap()
                .push_back((200, r#"{"items":[]}"#.to_owned()));
        }
        let api = YtApi::new(&base, quota());

        let videos = api.liked_videos(&FakeTokens).await.unwrap();

        assert_eq!(videos.len(), 51);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 4);
        assert!(seen[0].query.contains("myRating=like"));
        assert!(seen[1].query.contains("pageToken=next"));
        assert_eq!(seen[2].path, "/youtube/v3/videos");
    }

    #[test]
    fn iso_durations_are_read_in_seconds() {
        assert_eq!(parse_duration("PT4M13S"), Some(253));
        assert_eq!(parse_duration("PT1H2M3S"), Some(3723));
        assert_eq!(parse_duration("PT45S"), Some(45));
        assert_eq!(parse_duration("PT0S"), Some(0));
        assert_eq!(parse_duration("P0D"), None);
    }

    #[tokio::test]
    async fn quota_error_is_reported_with_its_reason() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back((
            403,
            r#"{"error":{"message":"Quota exceeded","errors":[{"reason":"quotaExceeded"}]}}"#.to_owned(),
        ));
        let api = YtApi::new(&base, quota());
        let error = api.remove_item(&FakeTokens, "UExx").await.unwrap_err();
        assert!(error.is_quota());
        assert_eq!(error.status(), Some(403));
    }

    #[test]
    fn pacific_day_follows_daylight_time() {
        let winter = DateTime::parse_from_rfc3339("2026-11-09T07:30:00Z").unwrap().timestamp_millis();
        assert_eq!(pacific_day(winter), "2026-11-08");
        let summer = DateTime::parse_from_rfc3339("2026-07-01T06:30:00Z").unwrap().timestamp_millis();
        assert_eq!(pacific_day(summer), "2026-06-30");
    }

    #[test]
    fn fallback_switch_ends_at_pacific_midnight() {
        let before = DateTime::parse_from_rfc3339("2026-11-09T07:59:00Z").unwrap().timestamp_millis();
        let after = DateTime::parse_from_rfc3339("2026-11-09T08:01:00Z").unwrap().timestamp_millis();
        let mut quota = Quota::default();
        quota.switch_to_fallback(before);
        assert!(quota.on_fallback(before));
        assert_eq!(quota.used(before), QUOTA_LIMIT);
        assert!(!quota.on_fallback(after));
        assert_eq!(quota.used(after), 0);
    }

    #[test]
    fn quota_resets_at_pacific_midnight() {
        let before = DateTime::parse_from_rfc3339("2026-11-09T07:59:00Z").unwrap().timestamp_millis();
        let after = DateTime::parse_from_rfc3339("2026-11-09T08:01:00Z").unwrap().timestamp_millis();
        let mut quota = Quota::default();
        quota.charge(50, before);
        assert_eq!(quota.used(before), 50);
        assert_eq!(quota.used(after), 0);
    }

    #[test]
    fn pacific_midnight_moves_with_the_daylight_changes() {
        let at = |text: &str| DateTime::parse_from_rfc3339(text).unwrap().timestamp_millis();
        assert_eq!(pacific_day(at("2026-03-08T07:59:00Z")), "2026-03-07");
        assert_eq!(pacific_day(at("2026-03-08T08:01:00Z")), "2026-03-08");
        assert_eq!(pacific_day(at("2026-03-09T06:59:00Z")), "2026-03-08");
        assert_eq!(pacific_day(at("2026-03-09T07:01:00Z")), "2026-03-09");
        assert_eq!(pacific_day(at("2026-11-01T06:59:00Z")), "2026-10-31");
        assert_eq!(pacific_day(at("2026-11-01T07:01:00Z")), "2026-11-01");
    }

    #[test]
    fn fallback_switch_ends_at_pacific_midnight_after_the_spring_change() {
        let at = |text: &str| DateTime::parse_from_rfc3339(text).unwrap().timestamp_millis();
        let before = at("2026-03-09T06:59:00Z");
        let after = at("2026-03-09T07:01:00Z");
        let mut quota = Quota::default();
        quota.switch_to_fallback(before);
        assert!(quota.on_fallback(before));
        assert!(!quota.on_fallback(after));
    }

    #[tokio::test]
    async fn rate_posts_the_rating_to_videos_rate() {
        let (base, mock) = start_mock().await;
        let api = YtApi::new(&base, quota());
        api.rate(&FakeTokens, "dQw4w9WgXcQ", true).await.unwrap();
        api.rate(&FakeTokens, "dQw4w9WgXcQ", false).await.unwrap();
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0].method, "POST");
        assert!(seen[0].path.ends_with("/videos/rate"));
        assert!(seen[0].query.contains("rating=like"));
        assert!(seen[1].query.contains("rating=none"));
    }

    #[test]
    fn only_eleven_character_youtube_ids_are_accepted() {
        assert!(is_video_id("dQw4w9WgXcQ"));
        assert!(is_video_id("a-_B0123456"));
        assert!(!is_video_id("v3"));
        assert!(!is_video_id("net:abcdefghij"));
        assert!(!is_video_id("dQw4w9WgXc!"));
        assert!(!is_video_id("dQw4w9WgXcQQ"));
    }
}

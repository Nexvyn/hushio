use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

use crate::google_auth::{SecretStore, TokenError, error_code, form_body, is_fresh, now_secs};
use crate::sync_queue::Remote;
use crate::yt_data_api::{ApiError, clip_title, interpret};

pub const TV_CLIENT_ID: &str = match option_env!("HUSHIO_YT_TV_CLIENT_ID") {
    Some(value) => value,
    None => "",
};

pub const TV_CLIENT_SECRET: &str = match option_env!("HUSHIO_YT_TV_CLIENT_SECRET") {
    Some(value) => value,
    None => "",
};

pub const TV_TOKEN_SLOT: &str = "youtube-tv-token";
const DEVICE_CODE_URL: &str = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const INNERTUBE_URL: &str = "https://music.youtube.com/youtubei/v1";
pub const VERIFICATION_URL: &str = "https://www.google.com/device";
const TV_SCOPE: &str = "http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content";
const DEVICE_GRANT: &str = "urn:ietf:params:oauth:grant-type:device_code";
const CLIENT_NAME: &str = "WEB_REMIX";
const CLIENT_VERSION: &str = "1.20250219.01.00";
const DEFAULT_INTERVAL_SECS: u64 = 5;
const SLOW_DOWN_STEP_SECS: u64 = 5;
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);

pub const MSG_NOT_CONFIGURED: &str = "YouTube Music connection isn't set up in this build.";
pub const MSG_EXPIRED: &str = "The code expired. Get a new one.";
pub const MSG_DECLINED: &str = "YouTube connection was declined.";
pub const MSG_DIDNT_COMPLETE: &str = "YouTube Music connection didn't complete.";
pub const MSG_CONNECT: &str = "Connect YouTube Music to keep syncing today.";
const MSG_ALREADY_PENDING: &str = "Finish connecting YouTube Music at google.com/device.";

#[derive(Clone)]
pub struct TvConfig {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub device_code_url: String,
    pub token_url: String,
    pub revoke_url: String,
    pub innertube_base: String,
}

impl TvConfig {
    pub fn production() -> Self {
        Self {
            client_id: TV_CLIENT_ID.to_owned(),
            client_secret: (!TV_CLIENT_SECRET.is_empty()).then(|| TV_CLIENT_SECRET.to_owned()),
            device_code_url: DEVICE_CODE_URL.to_owned(),
            token_url: TOKEN_URL.to_owned(),
            revoke_url: REVOKE_URL.to_owned(),
            innertube_base: INNERTUBE_URL.to_owned(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvCode {
    pub user_code: String,
    pub verification_url: String,
    pub expires_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TvStatus {
    pub connected: bool,
}

#[derive(Deserialize)]
struct DeviceReply {
    device_code: String,
    user_code: String,
    verification_url: Option<String>,
    interval: Option<u64>,
    expires_in: i64,
}

#[derive(Deserialize)]
struct TokenReply {
    access_token: String,
    expires_in: i64,
    refresh_token: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Grant {
    pub access_token: String,
    pub expires_in: i64,
    pub refresh_token: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Poll {
    Pending,
    SlowDown,
    Expired,
    Denied,
    Granted(Grant),
    Failed(String),
}

pub fn classify(status: u16, body: &str) -> Poll {
    if (200..300).contains(&status) {
        return match serde_json::from_str::<TokenReply>(body) {
            Ok(TokenReply {
                access_token,
                expires_in,
                refresh_token: Some(refresh_token),
            }) => Poll::Granted(Grant {
                access_token,
                expires_in,
                refresh_token,
            }),
            _ => Poll::Failed(MSG_DIDNT_COMPLETE.to_owned()),
        };
    }
    match error_code(body).as_deref() {
        Some("authorization_pending") => Poll::Pending,
        Some("slow_down") => Poll::SlowDown,
        Some("expired_token") => Poll::Expired,
        Some("access_denied") => Poll::Denied,
        _ => Poll::Failed(MSG_DIDNT_COMPLETE.to_owned()),
    }
}

pub fn next_interval(current: u64, poll: &Poll) -> u64 {
    match poll {
        Poll::SlowDown => current + SLOW_DOWN_STEP_SECS,
        _ => current,
    }
}

pub struct Innertube {
    config: TvConfig,
    store: Arc<dyn SecretStore>,
    http: reqwest::Client,
    access: Mutex<Option<(String, i64)>>,
    pending: Mutex<Option<CancellationToken>>,
}

impl Innertube {
    pub fn new(config: TvConfig, store: Arc<dyn SecretStore>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(crate::stream::USER_AGENT)
            .timeout(HTTP_TIMEOUT)
            .build()
            .unwrap_or_default();
        Self {
            config,
            store,
            http,
            access: Mutex::new(None),
            pending: Mutex::new(None),
        }
    }

    pub fn status(&self) -> TvStatus {
        TvStatus {
            connected: matches!(self.store.read(), Ok(Some(_))),
        }
    }

    pub async fn connect(&self, emit: &(dyn Fn(TvCode) + Sync)) -> Result<bool, String> {
        if self.config.client_id.is_empty() {
            return Err(MSG_NOT_CONFIGURED.to_owned());
        }
        let cancel = CancellationToken::new();
        {
            let mut pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            if pending.is_some() {
                return Err(MSG_ALREADY_PENDING.to_owned());
            }
            *pending = Some(cancel.clone());
        }
        let outcome = self.flow(emit, &cancel).await;
        *self.pending.lock().unwrap_or_else(PoisonError::into_inner) = None;
        outcome
    }

    pub fn cancel(&self) -> bool {
        let pending = self.pending.lock().unwrap_or_else(PoisonError::into_inner).clone();
        match pending {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }

    pub async fn revoke(&self) -> Result<(), String> {
        let Ok(Some(refresh)) = self.store.read() else {
            return Ok(());
        };
        match self.post(&self.config.revoke_url, &[("token", refresh.as_str())]).await {
            Some((status, _)) if (200..300).contains(&status) || status == 400 => Ok(()),
            Some(_) => Err("Google didn't accept the request. Sign in again, then retry.".to_owned()),
            None => Err("Couldn't connect right now. Check your connection and try again.".to_owned()),
        }
    }

    pub fn forget(&self) -> Result<(), String> {
        *self.access.lock().unwrap_or_else(PoisonError::into_inner) = None;
        self.store.clear()
    }

    pub async fn disconnect(&self) -> Result<TvStatus, String> {
        if let Ok(Some(refresh)) = self.store.read() {
            let _ = self.post(&self.config.revoke_url, &[("token", refresh.as_str())]).await;
        }
        *self.access.lock().unwrap_or_else(PoisonError::into_inner) = None;
        self.store.clear()?;
        Ok(self.status())
    }

    pub async fn access_token(&self) -> Result<String, TokenError> {
        if let Some((token, expires_at)) = self.cached() {
            if is_fresh(expires_at, now_secs()) {
                return Ok(token);
            }
        }
        let refresh = match self.store.read() {
            Ok(Some(value)) => value,
            Ok(None) => return Err(TokenError::SignedOut),
            Err(_) => return Err(TokenError::Retry),
        };
        let mut fields = vec![
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
            ("client_id", self.config.client_id.as_str()),
        ];
        if let Some(secret) = &self.config.client_secret {
            fields.push(("client_secret", secret.as_str()));
        }
        let Some((status, body)) = self.post(&self.config.token_url, &fields).await else {
            return Err(TokenError::Retry);
        };
        if (200..300).contains(&status) {
            let Ok(reply) = serde_json::from_str::<TokenReply>(&body) else {
                return Err(TokenError::Retry);
            };
            if let Some(rotated) = &reply.refresh_token {
                let _ = self.store.write(rotated);
            }
            *self.access.lock().unwrap_or_else(PoisonError::into_inner) =
                Some((reply.access_token.clone(), now_secs() + reply.expires_in));
            return Ok(reply.access_token);
        }
        if error_code(&body).as_deref() == Some("invalid_grant") {
            *self.access.lock().unwrap_or_else(PoisonError::into_inner) = None;
            let _ = self.store.clear();
            return Err(TokenError::SignedOut);
        }
        Err(TokenError::Retry)
    }

    async fn flow(&self, emit: &(dyn Fn(TvCode) + Sync), cancel: &CancellationToken) -> Result<bool, String> {
        let code = self.request_code().await?;
        let now = now_secs();
        let lifetime = code.expires_in.max(0);
        emit(TvCode {
            user_code: code.user_code,
            verification_url: code.verification_url.unwrap_or_else(|| VERIFICATION_URL.to_owned()),
            expires_at: (now + lifetime) * 1000,
        });
        let deadline = now + lifetime;
        let mut interval = code.interval.unwrap_or(DEFAULT_INTERVAL_SECS);
        loop {
            if now_secs() >= deadline {
                return Err(MSG_EXPIRED.to_owned());
            }
            tokio::select! {
                _ = cancel.cancelled() => return Ok(false),
                _ = tokio::time::sleep(Duration::from_secs(interval)) => {}
            }
            let poll = self.poll(&code.device_code).await;
            interval = next_interval(interval, &poll);
            match poll {
                Poll::Pending | Poll::SlowDown => {}
                Poll::Expired => return Err(MSG_EXPIRED.to_owned()),
                Poll::Denied => return Err(MSG_DECLINED.to_owned()),
                Poll::Failed(message) => return Err(message),
                Poll::Granted(grant) => {
                    self.store
                        .write(&grant.refresh_token)
                        .map_err(|_| MSG_DIDNT_COMPLETE.to_owned())?;
                    *self.access.lock().unwrap_or_else(PoisonError::into_inner) =
                        Some((grant.access_token, now_secs() + grant.expires_in));
                    return Ok(true);
                }
            }
        }
    }

    async fn request_code(&self) -> Result<DeviceReply, String> {
        let fields = [
            ("client_id", self.config.client_id.as_str()),
            ("scope", TV_SCOPE),
        ];
        let (status, body) = self
            .post(&self.config.device_code_url, &fields)
            .await
            .ok_or_else(|| MSG_DIDNT_COMPLETE.to_owned())?;
        if !(200..300).contains(&status) {
            return Err(MSG_DIDNT_COMPLETE.to_owned());
        }
        serde_json::from_str(&body).map_err(|_| MSG_DIDNT_COMPLETE.to_owned())
    }

    async fn poll(&self, device_code: &str) -> Poll {
        let mut fields = vec![
            ("client_id", self.config.client_id.as_str()),
            ("device_code", device_code),
            ("grant_type", DEVICE_GRANT),
        ];
        if let Some(secret) = &self.config.client_secret {
            fields.push(("client_secret", secret.as_str()));
        }
        match self.post(&self.config.token_url, &fields).await {
            Some((status, body)) => classify(status, &body),
            None => Poll::Pending,
        }
    }

    async fn post(&self, url: &str, fields: &[(&str, &str)]) -> Option<(u16, String)> {
        let response = self
            .http
            .post(url)
            .header(CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(form_body(fields))
            .send()
            .await
            .ok()?;
        let status = response.status().as_u16();
        Some((status, response.text().await.unwrap_or_default()))
    }

    fn cached(&self) -> Option<(String, i64)> {
        self.access.lock().unwrap_or_else(PoisonError::into_inner).clone()
    }

    async fn call(&self, path: &str, mut body: Value) -> Result<Value, ApiError> {
        let token = self.access_token().await.map_err(ApiError::Token)?;
        body["context"] = json!({ "client": { "clientName": CLIENT_NAME, "clientVersion": CLIENT_VERSION } });
        let url = format!("{}/{path}", self.config.innertube_base.trim_end_matches('/'));
        let response = self
            .http
            .post(url)
            .bearer_auth(token)
            .json(&body)
            .send()
            .await
            .map_err(|error| ApiError::Network(error.to_string()))?;
        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|error| ApiError::Network(error.to_string()))?;
        interpret(status, &text)
    }

    async fn edit(&self, playlist: &str, actions: Vec<Value>) -> Result<(), ApiError> {
        self.call("browse/edit_playlist", json!({ "playlistId": playlist, "actions": actions }))
            .await
            .map(|_| ())
    }

    async fn rows(&self, playlist: &str) -> Result<Vec<(String, String)>, ApiError> {
        let reply = self
            .call("browse", json!({ "browseId": format!("VL{playlist}") }))
            .await?;
        Ok(playlist_rows(&reply))
    }
}

impl Remote for Innertube {
    async fn create(&self, title: &str) -> Result<String, ApiError> {
        let reply = self
            .call(
                "playlist/create",
                json!({ "title": clip_title(title), "privacyStatus": "PRIVATE" }),
            )
            .await?;
        Ok(reply["playlistId"].as_str().unwrap_or_default().to_owned())
    }

    async fn rename(&self, playlist: &str, title: &str) -> Result<(), ApiError> {
        let action = json!({ "action": "ACTION_SET_PLAYLIST_NAME", "playlistName": clip_title(title) });
        self.edit(playlist, vec![action]).await
    }

    async fn delete(&self, playlist: &str) -> Result<(), ApiError> {
        self.call("playlist/delete", json!({ "playlistId": playlist }))
            .await
            .map(|_| ())
    }

    async fn add(&self, playlist: &str, video: &str) -> Result<(), ApiError> {
        let action = json!({ "action": "ACTION_ADD_VIDEO", "addedVideoId": video });
        self.edit(playlist, vec![action]).await
    }

    async fn remove(&self, playlist: &str, video: &str) -> Result<(), ApiError> {
        let rows = self.rows(playlist).await?;
        let Some((_, set_id)) = rows.iter().find(|(id, _)| id.as_str() == video) else {
            return Ok(());
        };
        let action = json!({ "action": "ACTION_REMOVE_VIDEO", "setVideoId": set_id });
        self.edit(playlist, vec![action]).await
    }

    async fn rate(&self, video: &str, like: bool) -> Result<(), ApiError> {
        let path = if like { "like/like" } else { "like/removelike" };
        self.call(path, json!({ "target": { "videoId": video } }))
            .await
            .map(|_| ())
    }
}

pub fn playlist_rows(value: &Value) -> Vec<(String, String)> {
    let mut rows = Vec::new();
    collect_rows(value, &mut rows);
    rows
}

fn collect_rows(value: &Value, rows: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            if let Some(item) = map.get("playlistItemData") {
                if let (Some(video), Some(set_id)) = (item["videoId"].as_str(), item["playlistSetVideoId"].as_str()) {
                    rows.push((video.to_owned(), set_id.to_owned()));
                }
            }
            for child in map.values() {
                collect_rows(child, rows);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_rows(item, rows);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
pub mod test_support {
    use super::*;

    #[derive(Default)]
    pub struct MemorySecret {
        value: Mutex<Option<String>>,
    }

    impl MemorySecret {
        pub fn holding(value: Option<&str>) -> Arc<Self> {
            Arc::new(Self {
                value: Mutex::new(value.map(str::to_owned)),
            })
        }

        pub fn current(&self) -> Option<String> {
            self.value.lock().unwrap().clone()
        }
    }

    impl SecretStore for MemorySecret {
        fn read(&self) -> Result<Option<String>, String> {
            Ok(self.current())
        }

        fn write(&self, value: &str) -> Result<(), String> {
            *self.value.lock().unwrap() = Some(value.to_owned());
            Ok(())
        }

        fn clear(&self) -> Result<(), String> {
            *self.value.lock().unwrap() = None;
            Ok(())
        }
    }

    pub fn config(base: &str) -> TvConfig {
        TvConfig {
            client_id: "tv-client".to_owned(),
            client_secret: Some("tv-secret".to_owned()),
            device_code_url: format!("{base}/device/code"),
            token_url: format!("{base}/token"),
            revoke_url: format!("{base}/revoke"),
            innertube_base: base.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;
    use crate::yt_data_api::test_support::start_mock;

    fn ignore(_: TvCode) {}

    fn device(expires_in: i64) -> (u16, String) {
        (
            200,
            json!({
                "device_code": "dc",
                "user_code": "ABCD-EFGH",
                "verification_url": "https://www.google.com/device",
                "interval": 0,
                "expires_in": expires_in,
            })
            .to_string(),
        )
    }

    fn grant(refresh: &str) -> (u16, String) {
        (
            200,
            json!({ "access_token": "access-1", "expires_in": 3600, "refresh_token": refresh }).to_string(),
        )
    }

    #[test]
    fn classify_reads_each_device_poll_state() {
        assert_eq!(classify(428, r#"{"error":"authorization_pending"}"#), Poll::Pending);
        assert_eq!(classify(400, r#"{"error":"slow_down"}"#), Poll::SlowDown);
        assert_eq!(classify(400, r#"{"error":"expired_token"}"#), Poll::Expired);
        assert_eq!(classify(400, r#"{"error":"access_denied"}"#), Poll::Denied);
        assert_eq!(
            classify(200, r#"{"access_token":"a","expires_in":3600,"refresh_token":"r"}"#),
            Poll::Granted(Grant {
                access_token: "a".to_owned(),
                expires_in: 3600,
                refresh_token: "r".to_owned(),
            })
        );
        assert!(matches!(classify(400, r#"{"error":"nope"}"#), Poll::Failed(_)));
        assert!(matches!(classify(200, r#"{"access_token":"a"}"#), Poll::Failed(_)));
    }

    #[test]
    fn slow_down_adds_five_seconds_and_other_states_keep_the_interval() {
        assert_eq!(next_interval(5, &Poll::SlowDown), 10);
        assert_eq!(next_interval(5, &Poll::Pending), 5);
    }

    #[tokio::test]
    async fn pending_then_grant_shows_the_code_and_stores_the_refresh_token() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back(device(1800));
            replies.push_back((428, r#"{"error":"authorization_pending"}"#.to_owned()));
            replies.push_back(grant("tv-refresh"));
        }
        let secret = MemorySecret::holding(None);
        let tv = Innertube::new(config(&base), secret.clone());
        let shown = Mutex::new(Vec::new());
        let emit = |code: TvCode| shown.lock().unwrap().push(code);
        assert_eq!(tv.connect(&emit).await, Ok(true));
        let shown = shown.lock().unwrap().clone();
        assert_eq!(shown.len(), 1);
        assert_eq!(shown[0].user_code, "ABCD-EFGH");
        assert_eq!(secret.current().as_deref(), Some("tv-refresh"));
        assert!(tv.status().connected);
        let seen = mock.seen.lock().unwrap().clone();
        assert_eq!(seen.len(), 3);
        assert!(seen[1].path.ends_with("/token"));
        assert!(seen[1].body.contains("device_code=dc"));
        assert!(seen[2].body.contains("device_code=dc"));
    }

    #[tokio::test]
    async fn expired_code_is_refused_without_polling() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back(device(0));
        let tv = Innertube::new(config(&base), MemorySecret::holding(None));
        assert_eq!(tv.connect(&ignore).await, Err(MSG_EXPIRED.to_owned()));
        assert_eq!(mock.seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn expired_token_reply_stops_polling_with_the_expiry_message() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back(device(1800));
            replies.push_back((400, r#"{"error":"expired_token"}"#.to_owned()));
        }
        let tv = Innertube::new(config(&base), MemorySecret::holding(None));
        assert_eq!(tv.connect(&ignore).await, Err(MSG_EXPIRED.to_owned()));
        assert_eq!(mock.seen.lock().unwrap().len(), 2);
        assert!(!tv.status().connected);
    }

    #[tokio::test]
    async fn denied_request_reports_the_decline_and_stores_nothing() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back(device(1800));
            replies.push_back((400, r#"{"error":"access_denied"}"#.to_owned()));
        }
        let secret = MemorySecret::holding(None);
        let tv = Innertube::new(config(&base), secret.clone());
        assert_eq!(tv.connect(&ignore).await, Err(MSG_DECLINED.to_owned()));
        assert_eq!(secret.current(), None);
    }

    #[tokio::test]
    async fn expired_access_token_refreshes_and_keeps_the_rotated_refresh_token() {
        let (base, mock) = start_mock().await;
        mock.replies.lock().unwrap().push_back(grant("rotated"));
        let secret = MemorySecret::holding(Some("old-refresh"));
        let tv = Innertube::new(config(&base), secret.clone());
        assert_eq!(tv.access_token().await.ok().as_deref(), Some("access-1"));
        assert_eq!(secret.current().as_deref(), Some("rotated"));
        let seen = mock.seen.lock().unwrap().clone();
        assert!(seen[0].body.contains("refresh_token=old-refresh"));
    }

    #[tokio::test]
    async fn invalid_grant_deletes_the_tv_token() {
        let (base, mock) = start_mock().await;
        mock.replies
            .lock()
            .unwrap()
            .push_back((400, r#"{"error":"invalid_grant"}"#.to_owned()));
        let secret = MemorySecret::holding(Some("revoked"));
        let tv = Innertube::new(config(&base), secret.clone());
        assert_eq!(tv.access_token().await, Err(TokenError::SignedOut));
        assert_eq!(secret.current(), None);
    }

    #[tokio::test]
    async fn without_a_tv_token_there_is_no_request_and_the_caller_is_signed_out() {
        let (base, mock) = start_mock().await;
        let tv = Innertube::new(config(&base), MemorySecret::holding(None));
        assert_eq!(tv.access_token().await, Err(TokenError::SignedOut));
        assert!(mock.seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn remove_looks_up_the_set_video_id_and_sends_the_remove_action() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back(grant("unused"));
            replies.push_back((
                200,
                json!({ "contents": [{ "musicResponsiveListItemRenderer": {
                    "playlistItemData": { "videoId": "v1", "playlistSetVideoId": "S1" } } }] })
                .to_string(),
            ));
            replies.push_back((200, "{}".to_owned()));
        }
        let tv = Innertube::new(config(&base), MemorySecret::holding(Some("tv-refresh")));
        tv.remove("PL1", "v1").await.unwrap();
        let seen = mock.seen.lock().unwrap().clone();
        assert!(seen[1].path.ends_with("/browse"));
        assert!(seen[1].body.contains("VLPL1"));
        assert!(seen[2].path.ends_with("/browse/edit_playlist"));
        assert!(seen[2].body.contains("ACTION_REMOVE_VIDEO"));
        assert!(seen[2].body.contains("S1"));
    }

    #[tokio::test]
    async fn create_asks_for_a_private_playlist_and_reads_its_id() {
        let (base, mock) = start_mock().await;
        {
            let mut replies = mock.replies.lock().unwrap();
            replies.push_back(grant("unused"));
            replies.push_back((200, r#"{"playlistId":"PLnew"}"#.to_owned()));
        }
        let tv = Innertube::new(config(&base), MemorySecret::holding(Some("tv-refresh")));
        assert_eq!(tv.create("Road trip").await.ok().as_deref(), Some("PLnew"));
        let seen = mock.seen.lock().unwrap().clone();
        assert!(seen[1].path.ends_with("/playlist/create"));
        let body: Value = serde_json::from_str(&seen[1].body).unwrap();
        assert_eq!(body["privacyStatus"], "PRIVATE");
        assert_eq!(body["context"]["client"]["clientName"], "WEB_REMIX");
    }

    #[test]
    fn playlist_rows_finds_every_nested_item_with_a_set_id() {
        let value = json!({
            "a": [{ "playlistItemData": { "videoId": "v1", "playlistSetVideoId": "S1" } }],
            "b": { "c": { "playlistItemData": { "videoId": "v2" } } },
            "d": { "playlistItemData": { "videoId": "v3", "playlistSetVideoId": "S3" } },
        });
        let mut rows = playlist_rows(&value);
        rows.sort();
        assert_eq!(
            rows,
            vec![("v1".to_owned(), "S1".to_owned()), ("v3".to_owned(), "S3".to_owned())]
        );
    }
}

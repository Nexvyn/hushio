use reqwest::header::AUTHORIZATION;
use reqwest::StatusCode;
use serde_json::{json, Value};

use super::{ApiError, Scrobble};
use crate::APP_NAME;

const BASE: &str = "https://api.listenbrainz.org/1";

pub async fn validate(http: &reqwest::Client, token: &str) -> Result<Option<String>, ApiError> {
    let response = http
        .get(format!("{BASE}/validate-token"))
        .header(AUTHORIZATION, format!("Token {token}"))
        .send()
        .await?;
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(ApiError::Status { status: status.as_u16() });
    }
    let body: Value = response.json().await?;
    if body.get("valid").and_then(Value::as_bool) != Some(true) {
        return Ok(None);
    }
    let name = body.get("user_name").and_then(Value::as_str).ok_or(ApiError::Malformed)?;
    Ok(Some(name.to_owned()))
}

pub fn metadata(item: &Scrobble) -> Value {
    let mut info = json!({ "media_player": APP_NAME });
    if !item.video_id.is_empty() {
        info["origin_url"] = json!(format!("https://music.youtube.com/watch?v={}", item.video_id));
    }
    if let Some(ms) = item.duration_ms {
        info["duration_ms"] = json!(ms);
    }
    json!({ "artist_name": item.artist, "track_name": item.title, "additional_info": info })
}

pub async fn now_playing(http: &reqwest::Client, token: &str, item: &Scrobble) -> Result<(), ApiError> {
    post(http, token, json!({ "listen_type": "playing_now", "payload": [{ "track_metadata": metadata(item) }] })).await
}

pub async fn submit(http: &reqwest::Client, token: &str, batch: &[Scrobble]) -> Result<(), ApiError> {
    let listen_type = if batch.len() == 1 { "single" } else { "import" };
    let payload: Vec<Value> = batch
        .iter()
        .map(|item| json!({ "listened_at": item.started_at, "track_metadata": metadata(item) }))
        .collect();
    post(http, token, json!({ "listen_type": listen_type, "payload": payload })).await
}

async fn post(http: &reqwest::Client, token: &str, body: Value) -> Result<(), ApiError> {
    let response = http
        .post(format!("{BASE}/submit-listens"))
        .header(AUTHORIZATION, format!("Token {token}"))
        .json(&body)
        .send()
        .await?;
    let status = response.status();
    if status.is_success() {
        Ok(())
    } else {
        Err(ApiError::Status { status: status.as_u16() })
    }
}

use serde_json::Value;

use super::{ApiError, Scrobble, BATCH};

pub const LASTFM_API_KEY: &str = "";
pub const LASTFM_API_SECRET: &str = "";
const BASE: &str = "https://ws.audioscrobbler.com/2.0/";
const AUTH_PAGE: &str = "https://www.last.fm/api/auth/";

type Params = Vec<(String, String)>;

pub fn configured() -> bool {
    !LASTFM_API_KEY.is_empty() && !LASTFM_API_SECRET.is_empty()
}

pub fn auth_url(token: &str) -> String {
    format!("{AUTH_PAGE}?api_key={LASTFM_API_KEY}&token={token}")
}

fn param(name: impl Into<String>, value: impl Into<String>) -> (String, String) {
    (name.into(), value.into())
}

pub fn sign(params: &[(String, String)], secret: &str) -> String {
    let mut pairs: Vec<(&str, &str)> = params
        .iter()
        .filter(|(name, _)| name != "format" && name != "callback")
        .map(|(name, value)| (name.as_str(), value.as_str()))
        .collect();
    pairs.sort_by(|a, b| a.0.cmp(b.0));
    let mut text = String::new();
    for (name, value) in pairs {
        text.push_str(name);
        text.push_str(value);
    }
    text.push_str(secret);
    format!("{:x}", md5::compute(text.as_bytes()))
}

async fn call(http: &reqwest::Client, method: &str, mut params: Params) -> Result<Value, ApiError> {
    params.push(param("method", method));
    params.push(param("api_key", LASTFM_API_KEY));
    let signature = sign(&params, LASTFM_API_SECRET);
    params.push(param("api_sig", signature));
    params.push(param("format", "json"));
    let body: Value = http.post(BASE).form(&params).send().await?.json().await?;
    match body.get("error").and_then(Value::as_u64) {
        Some(code) => {
            let message = body.get("message").and_then(Value::as_str).unwrap_or_default();
            Err(ApiError::Service { code, message: message.to_owned() })
        }
        None => Ok(body),
    }
}

pub async fn get_token(http: &reqwest::Client) -> Result<String, ApiError> {
    let body = call(http, "auth.getToken", Vec::new()).await?;
    body.get("token").and_then(Value::as_str).map(str::to_owned).ok_or(ApiError::Malformed)
}

pub async fn get_session(http: &reqwest::Client, token: &str) -> Result<(String, String), ApiError> {
    let body = call(http, "auth.getSession", vec![param("token", token)]).await?;
    let session = body.get("session").ok_or(ApiError::Malformed)?;
    let key = session.get("key").and_then(Value::as_str).ok_or(ApiError::Malformed)?;
    let name = session.get("name").and_then(Value::as_str).ok_or(ApiError::Malformed)?;
    Ok((key.to_owned(), name.to_owned()))
}

pub async fn now_playing(http: &reqwest::Client, key: &str, item: &Scrobble) -> Result<(), ApiError> {
    let mut params = vec![param("sk", key), param("artist", &item.artist), param("track", &item.title)];
    if let Some(ms) = item.duration_ms {
        params.push(param("duration", (ms / 1000).to_string()));
    }
    call(http, "track.updateNowPlaying", params).await.map(|_| ())
}

pub async fn scrobble(http: &reqwest::Client, key: &str, batch: &[Scrobble]) -> Result<(), ApiError> {
    let mut params = vec![param("sk", key)];
    for (index, item) in batch.iter().take(BATCH).enumerate() {
        params.push(param(format!("artist[{index}]"), &item.artist));
        params.push(param(format!("track[{index}]"), &item.title));
        params.push(param(format!("timestamp[{index}]"), item.started_at.to_string()));
        if let Some(ms) = item.duration_ms {
            params.push(param(format!("duration[{index}]"), (ms / 1000).to_string()));
        }
    }
    call(http, "track.scrobble", params).await.map(|_| ())
}

pub async fn set_love(http: &reqwest::Client, key: &str, artist: &str, title: &str, loved: bool) -> Result<(), ApiError> {
    let method = if loved { "track.love" } else { "track.unlove" };
    let params = vec![param("sk", key), param("artist", artist), param("track", title)];
    call(http, method, params).await.map(|_| ())
}

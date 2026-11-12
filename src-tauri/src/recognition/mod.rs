mod capture;
mod signature;

use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use signature::signature_of;

pub const SHZAM_ENDPOINT: &str = "https://amp.shazam.com/discovery/v5/en/US/android/-/tag";
const SAMPLE_RATE: u32 = 16_000;
const RECORD_SECONDS: u64 = 10;
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover: Option<String>,
    pub video_id: Option<String>,
    pub apple_url: Option<String>,
    pub spotify_url: Option<String>,
}

#[derive(Deserialize, Default)]
struct ShazamTrack {
    #[serde(default)]
    title: String,
    #[serde(default)]
    subtitle: String,
    #[serde(default)]
    images: ShazamImages,
    #[serde(default)]
    hub: ShazamHub,
    #[serde(default)]
    sections: Vec<ShazamSection>,
}

#[derive(Deserialize, Default)]
struct ShazamImages {
    #[serde(default)]
    coverarthq: String,
}

#[derive(Deserialize, Default)]
struct ShazamHub {
    #[serde(default)]
    options: Vec<ShazamOption>,
    #[serde(default)]
    providers: Vec<ShazamProvider>,
}

#[derive(Deserialize)]
struct ShazamOption {
    #[serde(default)]
    providername: String,
    #[serde(default)]
    actions: Vec<ShazamAction>,
}

#[derive(Deserialize)]
struct ShazamAction {
    #[serde(default)]
    uri: String,
}

#[derive(Deserialize)]
struct ShazamProvider {
    #[serde(default)]
    caption: String,
    #[serde(default)]
    actions: Vec<ShazamAction>,
}

#[derive(Deserialize)]
struct ShazamSection {
    #[serde(default, rename = "type")]
    kind: String,
    #[serde(default)]
    metadata: Vec<ShazamMetadata>,
}

#[derive(Deserialize)]
struct ShazamMetadata {
    #[serde(default)]
    title: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct ShazamAnswer {
    #[serde(default)]
    matches: Vec<ShazamMatch>,
}

#[derive(Deserialize)]
struct ShazamMatch {
    #[serde(default)]
    track: ShazamTrack,
}

fn video_id_from(uri: &str) -> Option<String> {
    if let Some(rest) = uri.split("v=").nth(1) {
        let id = rest.split('&').next().unwrap_or("");
        if id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Some(id.to_owned());
        }
    }
    let last = uri.rsplit('/').next().unwrap_or("");
    if last.len() == 11 && last.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Some(last.to_owned());
    }
    None
}

fn apple_url_of(hub: &ShazamHub) -> Option<String> {
    hub.options
        .iter()
        .find(|option| option.providername.to_ascii_lowercase().contains("apple"))
        .and_then(|option| option.actions.first())
        .map(|action| action.uri.clone())
}

fn spotify_url_of(hub: &ShazamHub) -> Option<String> {
    hub.providers
        .iter()
        .find(|provider| provider.caption.to_ascii_lowercase().contains("spotify"))
        .and_then(|provider| provider.actions.first())
        .map(|action| action.uri.clone())
}

fn album_of(sections: &[ShazamSection]) -> String {
    sections
        .iter()
        .filter(|section| section.kind == "SONG")
        .flat_map(|section| section.metadata.iter())
        .find(|entry| entry.title.eq_ignore_ascii_case("Album"))
        .map(|entry| entry.text.clone())
        .unwrap_or_default()
}

fn match_of(track: &ShazamTrack) -> Match {
    let cover = if track.images.coverarthq.is_empty() {
        None
    } else {
        Some(track.images.coverarthq.clone())
    };
    let apple = apple_url_of(&track.hub);
    let video = apple.as_deref().and_then(video_id_from);
    Match {
        title: track.title.clone(),
        artist: track.subtitle.clone(),
        album: album_of(&track.sections),
        cover,
        video_id: video,
        apple_url: apple,
        spotify_url: spotify_url_of(&track.hub),
    }
}

pub fn parse_answer(body: &str) -> Option<Match> {
    let value: Value = serde_json::from_str(body).ok()?;
    let answer: ShazamAnswer = serde_json::from_value(value).ok()?;
    let first = answer.matches.into_iter().next()?;
    if first.track.title.is_empty() {
        return None;
    }
    Some(match_of(&first.track))
}

fn request_body(samples: &[i16], timestamp: u64) -> Value {
    let signature = signature_of(samples);
    let encoded = STANDARD.encode(signature);
    json!({
        "geolocation": { "altitude": 120, "latitude": 0.0, "longitude": 0.0 },
        "signature": {
            "samplems": (samples.len() as u64 / 2) * 1000 / SAMPLE_RATE as u64,
            "timestamp": timestamp,
            "uri": format!("data:audio/vnd.shazam.sig;base64,{encoded}"),
        },
        "timestamp": timestamp,
        "timezone": "Europe/Paris",
    })
}

pub async fn recognise(
    http: &reqwest::Client,
    samples: &[i16],
    timestamp: u64,
) -> Result<Match, String> {
    if samples.len() < SAMPLE_RATE as usize / 2 {
        return Err("The recording was too short.".to_owned());
    }
    let identifier = format!(
        "{:X}-{:X}",
        timestamp.wrapping_mul(0x9E37_79B9_7F4A_7C15),
        samples.len() as u64
    );
    let url = format!(
        "{SHZAM_ENDPOINT}/{identifier}/{identifier}?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&video=v3"
    );
    let response = http
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Content-Language", "en_US")
        .timeout(TIMEOUT)
        .json(&request_body(samples, timestamp))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() == 404 {
        return Err("No match found.".to_owned());
    }
    if !response.status().is_success() {
        return Err(format!("Shazam answered with {}", response.status().as_u16()));
    }
    let body = response.text().await.map_err(|error| error.to_string())?;
    parse_answer(&body).ok_or_else(|| "No match found.".to_owned())
}

pub struct Service {    http: reqwest::Client,
}

impl Service {
    pub fn new() -> Result<Self, reqwest::Error> {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(format!("{}/{}", crate::APP_NAME, env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { http })
    }

    pub async fn recognise(&self) -> Result<Match, String> {
        let capture = capture::record(RECORD_SECONDS)?;
        let timestamp = chrono::Utc::now().timestamp() as u64;
        recognise(&self.http, capture.samples(), timestamp).await
    }
}

#[tauri::command]
pub async fn recognise_song(service: tauri::State<'_, std::sync::Arc<Service>>) -> Result<Match, String> {
    service.recognise().await
}
#[cfg(test)]
mod tests {
    use super::*;

    const ANSWER: &str = r#"{
      "matches": [
        {
          "track": {
            "title": "Great Song",
            "subtitle": "Nova",
            "key": "12345",
            "images": { "coverart": "https://img/small.jpg", "coverarthq": "https://img/big.jpg" },
            "hub": {
              "options": [
                { "providername": "Apple Music", "actions": [{ "uri": "https://music.apple.com/us/album/x/12345" }] }
              ],
              "providers": [
                { "caption": "Spotify", "actions": [{ "uri": "https://open.spotify.com/track/abc" }] }
              ]
            },
            "sections": [
              { "type": "SONG", "metadata": [{ "title": "Album", "text": "The Album" }] }
            ]
          }
        }
      ]
    }"#;

    #[test]
    fn the_match_carries_the_song_the_artist_and_the_cover() {
        let found = parse_answer(ANSWER).expect("match");
        assert_eq!(found.title, "Great Song");
        assert_eq!(found.artist, "Nova");
        assert_eq!(found.album, "The Album");
        assert_eq!(found.cover.as_deref(), Some("https://img/big.jpg"));
    }

    #[test]
    fn the_match_carries_the_links_to_the_other_services() {
        let found = parse_answer(ANSWER).expect("match");
        assert_eq!(
            found.apple_url.as_deref(),
            Some("https://music.apple.com/us/album/x/12345")
        );
        assert_eq!(found.spotify_url.as_deref(), Some("https://open.spotify.com/track/abc"));
    }

    #[test]
    fn an_answer_with_no_match_is_nothing() {
        assert!(parse_answer(r#"{"matches":[]}"#).is_none());
        assert!(parse_answer("{}").is_none());
        assert!(parse_answer("not json").is_none());
    }

    #[test]
    fn a_video_id_is_read_out_of_a_link() {
        assert_eq!(
            video_id_from("https://music.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_owned())
        );
        assert_eq!(video_id_from("https://example.com/song"), None);
    }

    #[test]
    fn the_request_body_carries_the_signature_and_the_sample_length() {
        let samples = vec![0i16; SAMPLE_RATE as usize];
        let body = request_body(&samples, 1_700_000_000);
        assert_eq!(body["timestamp"], 1_700_000_000u64);
        assert_eq!(body["signature"]["samplems"], 500);
        let uri = body["signature"]["uri"].as_str().expect("uri");
        assert!(uri.starts_with("data:audio/vnd.shazam.sig;base64,"));
    }
}

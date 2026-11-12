use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::persist;

pub mod smb;
pub mod webdav;

const OWNER: &str = "guest";
const STORE: &str = "network-servers";
const VERSION: u64 = 1;
const MAX_SERVERS: usize = 20;
const AUDIO_EXTENSIONS: [&str; 12] = [
    "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "m4b", "aiff", "alac", "wma", "webm",
];

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ServerKind {
    WebDav,
    Smb,
}

impl ServerKind {
    fn label(self) -> &'static str {
        match self {
            ServerKind::WebDav => "WebDAV",
            ServerKind::Smb => "SMB",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Server {
    pub id: String,
    pub kind: ServerKind,
    pub name: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub share: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerSummary {
    pub id: String,
    pub kind: ServerKind,
    pub kind_label: String,
    pub name: String,
    pub url: String,
    pub host: String,
    pub share: String,
    pub path: String,
    pub username: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTrack {
    pub id: String,
    pub server_id: String,
    pub server_name: String,
    pub path: String,
    pub name: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
struct Stored {
    servers: Vec<Server>,
}

impl Server {
    pub fn summary(&self) -> ServerSummary {
        ServerSummary {
            id: self.id.clone(),
            kind: self.kind,
            kind_label: self.kind.label().to_owned(),
            name: self.name.clone(),
            url: self.url.clone(),
            host: self.host.clone(),
            share: self.share.clone(),
            path: self.path.clone(),
            username: self.username.clone(),
        }
    }
}

pub fn is_audio_name(name: &str) -> bool {
    let extension = name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    AUDIO_EXTENSIONS.contains(&extension.as_str())
}

pub fn track_id(server_id: &str, path: &str) -> String {
    format!("net:{server_id}:{path}")
}

pub fn split_track_id(id: &str) -> Option<(&str, &str)> {
    let rest = id.strip_prefix("net:")?;
    let (server, path) = rest.split_once(':')?;
    if server.is_empty() || path.is_empty() {
        return None;
    }
    Some((server, path))
}

pub(crate) fn title_from_name(name: &str) -> (String, String) {
    let stem = name.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(name);
    match stem.split_once(" - ") {
        Some((artist, title)) => (title.trim().to_owned(), artist.trim().to_owned()),
        None => (stem.trim().to_owned(), String::new()),
    }
}

pub struct Service {
    root: PathBuf,
    servers: Mutex<Stored>,
}

impl Service {
    pub async fn load(root: PathBuf) -> Self {
        let stored = persist::read(&root, OWNER, STORE)
            .await
            .and_then(|value| {
                serde_json::from_value::<Stored>(value.get("state").cloned().unwrap_or(Value::Null)).ok()
            })
            .unwrap_or_default();
        Self {
            root,
            servers: Mutex::new(stored),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Stored> {
        self.servers
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    pub fn list(&self) -> Vec<ServerSummary> {
        self.lock()
            .servers
            .iter()
            .map(Server::summary)
            .collect()
    }

    pub fn server(&self, id: &str) -> Option<Server> {
        self.lock()
            .servers
            .iter()
            .find(|server| server.id == id)
            .cloned()
    }

    pub async fn save(&self, mut server: Server) -> Result<Vec<ServerSummary>, String> {
        server.name = server.name.trim().to_owned();
        if server.name.is_empty() {
            return Err("Give the server a name.".to_owned());
        }
        if server.id.is_empty() {
            server.id = crate::local_library::hash_path(&format!(
                "{}{}{}",
                server.name, server.url, server.host
            ));
        }
        let servers = {
            let mut stored = self.lock();
            match stored
                .servers
                .iter_mut()
                .find(|existing| existing.id == server.id)
            {
                Some(existing) => *existing = server,
                None => {
                    if stored.servers.len() >= MAX_SERVERS {
                        return Err("That's too many servers. Remove one first.".to_owned());
                    }
                    stored.servers.push(server);
                }
            }
            stored.servers.clone()
        };
        self.write(&servers).await?;
        Ok(servers.iter().map(Server::summary).collect())
    }

    pub async fn remove(&self, id: &str) -> Result<Vec<ServerSummary>, String> {
        let servers = {
            let mut stored = self.lock();
            stored.servers.retain(|server| server.id != id);
            stored.servers.clone()
        };
        self.write(&servers).await?;
        Ok(servers.iter().map(Server::summary).collect())
    }

    async fn write(&self, servers: &[Server]) -> Result<(), String> {
        let state = json!({ "servers": servers });
        persist::write(&self.root, OWNER, STORE, &json!({ "state": state, "version": VERSION }))
            .await
    }

    pub fn erase(&self) {
        let mut stored = self.lock();
        stored.servers.clear();
    }

    pub async fn list_tracks(&self, id: &str, path: &str) -> Result<Vec<NetworkTrack>, String> {
        let server = self
            .server(id)
            .ok_or_else(|| "That server is gone.".to_owned())?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| error.to_string())?;
        match server.kind {
            ServerKind::WebDav => {
                let entries = webdav::list(&http, &server, path).await?;
                Ok(webdav::tracks_from(&server, entries))
            }
            ServerKind::Smb => {
                let entries = smb::list(&server, path).await?;
                Ok(smb::tracks_from(&server, entries))
            }
        }
    }

    pub async fn read_track(
        &self,
        id: &str,
        path: &str,
        from: u64,
        to: Option<u64>,
    ) -> Result<Vec<u8>, String> {
        let server = self
            .server(id)
            .ok_or_else(|| "That server is gone.".to_owned())?;
        match server.kind {
            ServerKind::WebDav => {
                let http = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(60))
                    .build()
                    .map_err(|error| error.to_string())?;
                webdav::read_range(&http, &server, path, from, to).await
            }
            ServerKind::Smb => smb::read(&server, path, from, to).await,
        }
    }
}

#[tauri::command]
pub fn network_servers(network: tauri::State<'_, Arc<Service>>) -> Vec<ServerSummary> {
    network.list()
}

#[tauri::command]
pub async fn network_server_save(
    network: tauri::State<'_, Arc<Service>>,
    server: Server,
) -> Result<Vec<ServerSummary>, String> {
    network.save(server).await
}

#[tauri::command]
pub async fn network_server_remove(
    network: tauri::State<'_, Arc<Service>>,
    id: String,
) -> Result<Vec<ServerSummary>, String> {
    network.remove(&id).await
}

#[tauri::command]
pub async fn network_tracks(
    network: tauri::State<'_, Arc<Service>>,
    id: String,
    path: String,
) -> Result<Vec<NetworkTrack>, String> {
    network.list_tracks(&id, &path).await
}

#[tauri::command]
pub async fn network_track_bytes(
    network: tauri::State<'_, Arc<Service>>,
    id: String,
    path: String,
    from: u64,
    to: Option<u64>,
) -> Result<Vec<u8>, String> {
    network.read_track(&id, &path, from, to).await
}

fn parse_range(header: &str) -> Option<(u64, Option<u64>)> {
    let rest = header.strip_prefix("bytes=")?;
    let (from, to) = rest.split_once('-')?;
    let from = from.trim().parse::<u64>().ok()?;
    let to = to.trim();
    if to.is_empty() {
        return Some((from, None));
    }
    Some((from, to.parse::<u64>().ok()))
}

fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = input.get(i + 1..i + 3)?;
            if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
                return None;
            }
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn request_track(path: &str) -> Option<(String, String)> {
    let rest = path.strip_prefix('/')?;
    let decoded = percent_decode(rest)?;
    let id = if decoded.starts_with("net:") {
        decoded
    } else {
        format!("net:{decoded}")
    };
    let (server_id, track_path) = split_track_id(&id)?;
    Some((server_id.to_owned(), track_path.to_owned()))
}

fn track_content_type(track_path: &str) -> &'static str {
    let extension = track_path
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "m4a" | "aac" => "audio/mp4",
        "ogg" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        _ => "application/octet-stream",
    }
}

pub async fn serve_track(
    network: &Service,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let path = request.uri().path().to_owned();
    let Some((server_id, track_path)) = request_track(&path) else {
        return network_error(tauri::http::StatusCode::BAD_REQUEST);
    };
    let range = request
        .headers()
        .get("range")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_range);
    let (from, to) = range.unwrap_or((0, None));
    match network.read_track(&server_id, &track_path, from, to).await {
        Ok(bytes) => {
            let content_range = (range.is_some() && !bytes.is_empty()).then(|| {
                let last = from + bytes.len() as u64 - 1;
                format!("bytes {from}-{last}/*")
            });
            let mut response = tauri::http::Response::builder()
                .status(if range.is_some() {
                    tauri::http::StatusCode::PARTIAL_CONTENT
                } else {
                    tauri::http::StatusCode::OK
                })
                .header("Accept-Ranges", "bytes")
                .header("Content-Type", track_content_type(&track_path));
            if let Some(content_range) = content_range {
                response = response.header("Content-Range", content_range);
            }
            response
                .body(bytes)
                .unwrap_or_else(|_| network_error(tauri::http::StatusCode::INTERNAL_SERVER_ERROR))
        }
        Err(_) => network_error(tauri::http::StatusCode::NOT_FOUND),
    }
}

fn network_error(status: tauri::http::StatusCode) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .body(Vec::new())
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(kind: ServerKind) -> Server {
        Server {
            id: "s1".to_owned(),
            kind,
            name: "Music box".to_owned(),
            url: "https://box.example/dav".to_owned(),
            host: String::new(),
            share: String::new(),
            path: String::new(),
            username: "me".to_owned(),
            password: "secret".to_owned(),
        }
    }

    #[test]
    fn a_summary_leaves_the_password_out() {
        let summary = server(ServerKind::WebDav).summary();
        assert_eq!(summary.kind_label, "WebDAV");
        assert_eq!(summary.username, "me");
        assert!(!format!("{summary:?}").contains("secret"));
    }

    #[test]
    fn the_smb_kind_has_its_own_label() {
        assert_eq!(server(ServerKind::Smb).summary().kind_label, "SMB");
    }

    #[test]
    fn audio_names_are_recognised_by_their_extension() {
        assert!(is_audio_name("song.mp3"));
        assert!(is_audio_name("Song.FLAC"));
        assert!(is_audio_name("track.m4a"));
        assert!(!is_audio_name("cover.jpg"));
        assert!(!is_audio_name("readme"));
    }

    #[test]
    fn a_track_id_round_trips() {
        let id = track_id("s1", "Albums/One/song.mp3");
        assert_eq!(split_track_id(&id), Some(("s1", "Albums/One/song.mp3")));
        assert_eq!(split_track_id("local:abc"), None);
        assert_eq!(split_track_id("net:s1:"), None);
    }

    #[test]
    fn a_name_with_a_dash_gives_the_artist_and_the_title() {
        let (title, artist) = title_from_name("Nova - Great Song.mp3");
        assert_eq!(title, "Great Song");
        assert_eq!(artist, "Nova");
    }

    #[test]
    fn a_name_without_a_dash_is_only_a_title() {
        let (title, artist) = title_from_name("Great Song.mp3");
        assert_eq!(title, "Great Song");
        assert_eq!(artist, "");
    }

    #[test]
    fn an_encoded_request_path_gives_the_server_and_the_track() {
        assert_eq!(
            request_track("/s1%3A%2Fdav%2FNova%20-%20Song.mp3"),
            Some(("s1".to_owned(), "/dav/Nova - Song.mp3".to_owned()))
        );
    }

    #[test]
    fn a_request_path_with_the_net_prefix_is_accepted() {
        assert_eq!(
            request_track("/net%3As1%3A%2Fdav%2Fa.mp3"),
            Some(("s1".to_owned(), "/dav/a.mp3".to_owned()))
        );
        assert_eq!(
            request_track("/net:s1:/dav/a.mp3"),
            Some(("s1".to_owned(), "/dav/a.mp3".to_owned()))
        );
    }

    #[test]
    fn a_plus_in_a_track_name_stays_a_plus() {
        assert_eq!(
            request_track("/s1%3A%2Fdav%2FA%2Bb.mp3"),
            Some(("s1".to_owned(), "/dav/A+b.mp3".to_owned()))
        );
        assert_eq!(
            request_track("/s1%3A%2Fdav%2FA+b%20c.mp3"),
            Some(("s1".to_owned(), "/dav/A+b c.mp3".to_owned()))
        );
    }

    #[test]
    fn an_empty_or_broken_request_path_gives_nothing() {
        assert_eq!(request_track(""), None);
        assert_eq!(request_track("/"), None);
        assert_eq!(request_track("/s1"), None);
        assert_eq!(request_track("s1%3A%2Fdav%2Fa.mp3"), None);
        assert_eq!(request_track("/s1%3"), None);
        assert_eq!(request_track("/s1%zz%2Fdav"), None);
        assert_eq!(request_track("/s1%3A%FF"), None);
    }

    #[test]
    fn a_content_type_follows_the_track_extension() {
        assert_eq!(track_content_type("/dav/Song.mp3"), "audio/mpeg");
        assert_eq!(track_content_type("/dav/Song.FLAC"), "audio/flac");
        assert_eq!(track_content_type("/dav/Song.m4a"), "audio/mp4");
        assert_eq!(track_content_type("/dav/Song.aac"), "audio/mp4");
        assert_eq!(track_content_type("/dav/Song.ogg"), "audio/ogg");
        assert_eq!(track_content_type("/dav/Song.opus"), "audio/ogg");
        assert_eq!(track_content_type("/dav/Song.wav"), "audio/wav");
        assert_eq!(track_content_type("/dav/Song.wma"), "application/octet-stream");
        assert_eq!(track_content_type("/dav/readme"), "application/octet-stream");
    }
}

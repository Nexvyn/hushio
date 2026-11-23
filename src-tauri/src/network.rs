use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::persist;
use crate::secrets::{forget_secret, keep_secret, resolve_secret, Vault};

pub mod smb;
pub mod subsonic;
pub mod webdav;

const OWNER: &str = "guest";
const STORE: &str = "network-servers";
const VERSION: u64 = 1;
const MAX_SERVERS: usize = 20;
const STALE_AFTER_MS: u64 = 24 * 60 * 60 * 1000;
const AUDIO_EXTENSIONS: [&str; 12] = [
    "mp3", "m4a", "aac", "flac", "wav", "ogg", "opus", "m4b", "aiff", "alac", "wma", "webm",
];

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ServerKind {
    WebDav,
    Smb,
    Subsonic,
}

impl ServerKind {
    fn label(self) -> &'static str {
        match self {
            ServerKind::WebDav => "WebDAV",
            ServerKind::Smb => "SMB",
            ServerKind::Subsonic => "Music server",
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
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub password: String,
    #[serde(default)]
    pub scanned_at: u64,
    #[serde(default)]
    pub song_count: usize,
    #[serde(default)]
    pub truncated: bool,
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
    pub scanned_at: u64,
    pub song_count: usize,
    pub truncated: bool,
    pub scanning: bool,
    pub scan_error: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_art: Option<String>,
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
            scanned_at: self.scanned_at,
            song_count: self.song_count,
            truncated: self.truncated,
            scanning: false,
            scan_error: String::new(),
        }
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}

fn songs_store(server_id: &str) -> String {
    format!("network-songs-{server_id}")
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

fn share_key(id: &str) -> String {
    format!("network-share:{id}")
}

pub struct Service {
    root: PathBuf,
    servers: Mutex<Stored>,
    vault: Arc<dyn Vault>,
    scanning: Mutex<HashSet<String>>,
    scan_errors: Mutex<HashMap<String, String>>,
}

impl Service {
    pub async fn load(root: PathBuf, vault: Arc<dyn Vault>) -> Self {
        let mut stored = persist::read(&root, OWNER, STORE)
            .await
            .and_then(|value| {
                serde_json::from_value::<Stored>(value.get("state").cloned().unwrap_or(Value::Null)).ok()
            })
            .unwrap_or_default();
        let mut moved = false;
        for server in &mut stored.servers {
            if server.password.is_empty() {
                continue;
            }
            server.password = keep_secret(vault.as_ref(), &share_key(&server.id), &server.password).unwrap_or_default();
            moved |= server.password.is_empty();
        }
        let service = Self {
            root,
            servers: Mutex::new(stored),
            vault,
            scanning: Mutex::new(HashSet::new()),
            scan_errors: Mutex::new(HashMap::new()),
        };
        if moved {
            let servers = service.lock().servers.clone();
            if let Err(error) = service.write(&servers).await {
                tracing::warn!("network servers not rewritten after moving passwords: {error}");
            }
        }
        service
    }

    fn connectable(&self, id: &str) -> Result<Server, String> {
        let mut server = self.server(id).ok_or_else(|| "That server is gone.".to_owned())?;
        server.password = resolve_secret(self.vault.as_ref(), &share_key(id), Some(server.password.as_str()))
            .unwrap_or_default();
        Ok(server)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Stored> {
        self.servers
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
    }

    fn summaries(&self) -> Vec<ServerSummary> {
        let servers = self.lock().servers.clone();
        let scanning = self.scanning.lock().unwrap_or_else(|poison| poison.into_inner()).clone();
        let errors = self.scan_errors.lock().unwrap_or_else(|poison| poison.into_inner()).clone();
        servers
            .iter()
            .map(|server| {
                let mut summary = server.summary();
                summary.scanning = scanning.contains(&server.id);
                summary.scan_error = errors.get(&server.id).cloned().unwrap_or_default();
                summary
            })
            .collect()
    }

    pub fn list(&self) -> Vec<ServerSummary> {
        self.summaries()
    }

    fn begin_scan(&self, id: &str) -> bool {
        self.scanning
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .insert(id.to_owned())
    }

    fn end_scan(&self, id: &str, outcome: &Result<(), String>) {
        self.scanning
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .remove(id);
        let mut errors = self.scan_errors.lock().unwrap_or_else(|poison| poison.into_inner());
        match outcome {
            Ok(()) => errors.remove(id),
            Err(message) => errors.insert(id.to_owned(), message.clone()),
        };
    }

    pub fn refresh(self: Arc<Self>, id: String) -> Result<Vec<ServerSummary>, String> {
        let server = self.server(&id).ok_or_else(|| "That server is gone.".to_owned())?;
        if server.kind != ServerKind::Subsonic {
            return Err("Only music servers can be refreshed.".to_owned());
        }
        if self.begin_scan(&id) {
            let service = Arc::clone(&self);
            tauri::async_runtime::spawn(async move {
                let outcome = service.scan_inner(&id).await;
                service.end_scan(&id, &outcome);
            });
        }
        Ok(self.summaries())
    }

    pub fn refresh_stale(self: Arc<Self>) {
        let now = now_ms();
        let stale: Vec<String> = self
            .lock()
            .servers
            .iter()
            .filter(|server| server.kind == ServerKind::Subsonic)
            .filter(|server| now.saturating_sub(server.scanned_at) > STALE_AFTER_MS)
            .map(|server| server.id.clone())
            .collect();
        for id in stale {
            let _ = Arc::clone(&self).refresh(id);
        }
    }

    async fn scan_inner(&self, id: &str) -> Result<(), String> {
        let server = self.connectable(id)?;
        let http = subsonic::client()?;
        let scan = subsonic::scan(&http, &server).await?;
        let count = scan.songs.len();
        let truncated = scan.truncated;
        let songs = serde_json::to_value(&scan.songs).map_err(|error| error.to_string())?;
        persist::write(
            &self.root,
            OWNER,
            &songs_store(id),
            &json!({ "state": { "songs": songs }, "version": VERSION }),
        )
        .await?;
        let servers = {
            let mut stored = self.lock();
            if let Some(entry) = stored.servers.iter_mut().find(|entry| entry.id == id) {
                entry.scanned_at = now_ms();
                entry.song_count = count;
                entry.truncated = truncated;
            }
            stored.servers.clone()
        };
        self.write(&servers).await
    }

    async fn cached_tracks(&self, server: &Server) -> Vec<NetworkTrack> {
        let songs = persist::read(&self.root, OWNER, &songs_store(&server.id))
            .await
            .and_then(|value| serde_json::from_value::<Vec<subsonic::Song>>(value["state"]["songs"].clone()).ok())
            .unwrap_or_default();
        songs.iter().map(|song| subsonic::track_of(server, song)).collect()
    }

    pub fn server(&self, id: &str) -> Option<Server> {
        self.lock()
            .servers
            .iter()
            .find(|server| server.id == id)
            .cloned()
    }

    pub async fn save(self: Arc<Self>, mut server: Server) -> Result<Vec<ServerSummary>, String> {
        server.name = server.name.trim().to_owned();
        let is_music_server = server.kind == ServerKind::Subsonic;
        if is_music_server {
            server.url = subsonic::base_url(&server.url)?.to_string();
            server.username = server.username.trim().to_owned();
            subsonic::check_login(&server)?;
            if server.name.is_empty() {
                server.name = subsonic::base_url(&server.url)
                    .ok()
                    .and_then(|url| url.host_str().map(str::to_owned))
                    .unwrap_or_default();
            }
        }
        if server.name.is_empty() {
            return Err("Give the server a name.".to_owned());
        }
        if server.id.is_empty() {
            server.id = crate::local_library::hash_path(&format!(
                "{}{}{}",
                server.name, server.url, server.host
            ));
        }
        let id = server.id.clone();
        let servers = {
            let mut stored = self.lock();
            let is_new = !stored.servers.iter().any(|existing| existing.id == server.id);
            if is_new && stored.servers.len() >= MAX_SERVERS {
                return Err("That's too many servers. Remove one first.".to_owned());
            }
            server.password = keep_secret(self.vault.as_ref(), &share_key(&server.id), &server.password)
                .unwrap_or_default();
            match stored
                .servers
                .iter_mut()
                .find(|existing| existing.id == server.id)
            {
                Some(existing) => {
                    server.scanned_at = existing.scanned_at;
                    server.song_count = existing.song_count;
                    server.truncated = existing.truncated;
                    *existing = server;
                }
                None => stored.servers.push(server),
            }
            stored.servers.clone()
        };
        self.write(&servers).await?;
        if is_music_server {
            let _ = self.clone().refresh(id)?;
        }
        Ok(self.summaries())
    }

    pub async fn remove(&self, id: &str) -> Result<Vec<ServerSummary>, String> {
        let servers = {
            let mut stored = self.lock();
            stored.servers.retain(|server| server.id != id);
            stored.servers.clone()
        };
        self.write(&servers).await?;
        forget_secret(self.vault.as_ref(), &share_key(id));
        let _ = std::fs::remove_file(persist::store_path(&self.root, OWNER, &songs_store(id)));
        Ok(self.summaries())
    }

    async fn write(&self, servers: &[Server]) -> Result<(), String> {
        let state = json!({ "servers": servers });
        persist::write(&self.root, OWNER, STORE, &json!({ "state": state, "version": VERSION }))
            .await
    }

    pub fn erase(&self) {
        let servers = std::mem::take(&mut self.lock().servers);
        for server in servers {
            forget_secret(self.vault.as_ref(), &share_key(&server.id));
            let _ = std::fs::remove_file(persist::store_path(&self.root, OWNER, &songs_store(&server.id)));
        }
    }

    pub async fn list_tracks(&self, id: &str, path: &str) -> Result<Vec<NetworkTrack>, String> {
        let server = self.connectable(id)?;
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
            ServerKind::Subsonic => Ok(self.cached_tracks(&server).await),
        }
    }

    pub async fn read_track(
        &self,
        id: &str,
        path: &str,
        from: u64,
        to: Option<u64>,
    ) -> Result<Vec<u8>, String> {
        let server = self.connectable(id)?;
        match server.kind {
            ServerKind::WebDav => {
                let http = reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(60))
                    .build()
                    .map_err(|error| error.to_string())?;
                webdav::read_range(&http, &server, path, from, to).await
            }
            ServerKind::Smb => smb::read(&server, path, from, to).await,
            ServerKind::Subsonic => {
                let http = subsonic::client()?;
                subsonic::stream(&http, &server, path, from, to).await
            }
        }
    }

    pub async fn read_art(&self, id: &str, cover: &str) -> Result<Vec<u8>, String> {
        let server = self.connectable(id)?;
        if server.kind != ServerKind::Subsonic {
            return Err("That server has no cover art.".to_owned());
        }
        let http = subsonic::client()?;
        subsonic::cover(&http, &server, cover).await
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
    network.inner().clone().save(server).await
}

#[tauri::command]
pub async fn network_server_test(server: Server) -> Result<String, String> {
    if server.kind != ServerKind::Subsonic {
        return Err("Only music servers can be tested this way.".to_owned());
    }
    subsonic::test(&server).await
}

#[tauri::command]
pub fn network_server_refresh(
    network: tauri::State<'_, Arc<Service>>,
    id: String,
) -> Result<Vec<ServerSummary>, String> {
    network.inner().clone().refresh(id)
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

fn request_art(path: &str) -> Option<(String, String)> {
    let rest = path.strip_prefix('/')?;
    let decoded = percent_decode(rest)?;
    let target = decoded.strip_prefix("netart:")?;
    let (server_id, cover) = target.split_once(':')?;
    (!server_id.is_empty() && !cover.is_empty()).then(|| (server_id.to_owned(), cover.to_owned()))
}

pub async fn serve_track(
    network: &Service,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let path = request.uri().path().to_owned();
    if let Some((server_id, cover)) = request_art(&path) {
        return match network.read_art(&server_id, &cover).await {
            Ok(bytes) => tauri::http::Response::builder()
                .status(tauri::http::StatusCode::OK)
                .header("Content-Type", subsonic::image_type(&bytes))
                .header("Cache-Control", "max-age=86400")
                .body(bytes)
                .unwrap_or_else(|_| network_error(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)),
            Err(_) => network_error(tauri::http::StatusCode::NOT_FOUND),
        };
    }
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
            scanned_at: 0,
            song_count: 0,
            truncated: false,
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

#[cfg(test)]
mod secret_tests {
    use super::*;
    use crate::secrets::test_support::MemoryVault;

    fn saved_with_password() -> Value {
        json!({
            "state": {
                "servers": [{
                    "id": "s1",
                    "kind": "webDav",
                    "name": "Box",
                    "url": "https://box.example/dav",
                    "username": "me",
                    "password": "hunter2"
                }]
            },
            "version": VERSION
        })
    }

    async fn write_servers(root: &std::path::Path) {
        persist::write(root, OWNER, STORE, &saved_with_password()).await.unwrap();
    }

    #[tokio::test]
    async fn a_plaintext_password_moves_to_the_key_store_and_leaves_the_file() {
        let dir = tempfile::tempdir().unwrap();
        write_servers(dir.path()).await;
        let vault = Arc::new(MemoryVault::default());

        let service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        assert_eq!(vault.get("network-share:s1").as_deref(), Some("hunter2"));
        let file = persist::read(dir.path(), OWNER, STORE).await.unwrap();
        assert!(!file.to_string().contains("hunter2"));
        assert_eq!(service.connectable("s1").unwrap().password, "hunter2");
    }

    #[tokio::test]
    async fn a_refusing_key_store_keeps_the_password_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        write_servers(dir.path()).await;
        let vault = MemoryVault::refusing();

        let service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        assert!(vault.get("network-share:s1").is_none());
        let file = persist::read(dir.path(), OWNER, STORE).await.unwrap();
        assert_eq!(file["state"]["servers"][0]["password"], "hunter2");
        assert_eq!(service.connectable("s1").unwrap().password, "hunter2");
    }

    #[tokio::test]
    async fn removing_a_server_removes_its_password_from_the_key_store() {
        let dir = tempfile::tempdir().unwrap();
        write_servers(dir.path()).await;
        let vault = Arc::new(MemoryVault::default());
        let service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        service.remove("s1").await.unwrap();

        assert!(vault.get("network-share:s1").is_none());
    }
}

#[cfg(test)]
mod music_server_tests {
    use super::*;
    use crate::network::subsonic::mock_server::{self, Library, AUDIO, PASSWORD};
    use crate::secrets::test_support::MemoryVault;

    fn input(url: String, password: &str) -> Server {
        Server {
            id: String::new(),
            kind: ServerKind::Subsonic,
            name: String::new(),
            url,
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

    async fn wait_until_idle(service: &Service) {
        for _ in 0..400 {
            if service.summaries().iter().all(|server| !server.scanning) {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        panic!("the scan did not finish");
    }

    #[tokio::test]
    async fn a_saved_music_server_is_scanned_and_its_songs_stream_and_show_art() {
        let url = mock_server::serve(Library { albums: 3, songs_per_album: 2 }).await;
        let dir = tempfile::tempdir().unwrap();
        let vault = Arc::new(MemoryVault::default());
        let service = Arc::new(Service::load(dir.path().to_path_buf(), vault.clone()).await);

        let saved = service.clone().save(input(url, PASSWORD)).await.unwrap();
        let id = saved[0].id.clone();
        assert_eq!(saved[0].name, "127.0.0.1");
        wait_until_idle(&service).await;

        let summary = service.list()[0].clone();
        assert_eq!(summary.song_count, 6);
        assert!(!summary.truncated);
        assert!(summary.scan_error.is_empty());
        assert!(summary.scanned_at > 0);

        let tracks = service.list_tracks(&id, "").await.unwrap();
        assert_eq!(tracks.len(), 6);
        assert_eq!(tracks[0].id, format!("net:{id}:s-0-0"));
        assert_eq!(tracks[0].cover_art.as_deref(), Some("al-0"));

        let range = tauri::http::Request::builder()
            .uri(format!("/net%3A{id}%3As-0-0"))
            .header("range", "bytes=2-5")
            .body(Vec::new())
            .unwrap();
        let response = serve_track(&service, &range).await;
        assert_eq!(response.status(), 206);
        assert_eq!(response.body(), &AUDIO[2..=5].to_vec());

        let art = tauri::http::Request::builder()
            .uri(format!("/netart%3A{id}%3Aal-0"))
            .body(Vec::new())
            .unwrap();
        let response = serve_track(&service, &art).await;
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["content-type"].to_str().unwrap(), "image/jpeg");

        let file = persist::read(dir.path(), OWNER, STORE).await.unwrap();
        assert!(!file.to_string().contains(PASSWORD));
        assert_eq!(vault.get(&share_key(&id)).as_deref(), Some(PASSWORD));
    }

    #[tokio::test]
    async fn a_music_server_without_a_password_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let service = Arc::new(Service::load(dir.path().to_path_buf(), Arc::new(MemoryVault::default())).await);
        let error = service
            .clone()
            .save(input("https://music.example".to_owned(), ""))
            .await
            .unwrap_err();
        assert_eq!(error, "Enter the username and password.");
        assert!(service.list().is_empty());
    }

    #[tokio::test]
    async fn removing_a_music_server_forgets_its_password_and_songs() {
        let url = mock_server::serve(Library { albums: 1, songs_per_album: 1 }).await;
        let dir = tempfile::tempdir().unwrap();
        let vault = Arc::new(MemoryVault::default());
        let service = Arc::new(Service::load(dir.path().to_path_buf(), vault.clone()).await);
        let saved = service.clone().save(input(url, PASSWORD)).await.unwrap();
        let id = saved[0].id.clone();
        wait_until_idle(&service).await;

        service.remove(&id).await.unwrap();

        assert!(service.list().is_empty());
        assert!(vault.get(&share_key(&id)).is_none());
        assert!(!persist::store_path(dir.path(), OWNER, &songs_store(&id)).exists());
    }
}

use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use quick_xml::events::Event;
use quick_xml::Reader;

use super::{is_audio_name, title_from_name, Chunk, NetworkTrack, Server};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn basic_auth(username: &str, password: &str) -> Option<String> {
    if username.is_empty() && password.is_empty() {
        return None;
    }
    Some(format!(
        "Basic {}",
        STANDARD.encode(format!("{username}:{password}"))
    ))
}

fn address(base: &str, path: &str) -> Result<String, String> {
    let root = url::Url::parse(&format!("{}/", base.trim().trim_end_matches('/')))
        .map_err(|error| error.to_string())?;
    root.join(path)
        .map(|url| url.to_string())
        .map_err(|error| error.to_string())
}

fn decode(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let escaped = bytes
            .get(index + 1..index + 3)
            .and_then(|pair| std::str::from_utf8(pair).ok())
            .and_then(|pair| u8::from_str_radix(pair, 16).ok());
        match (bytes[index], escaped) {
            (b'%', Some(value)) => {
                out.push(value);
                index += 3;
            }
            _ => {
                out.push(bytes[index]);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn local_name(path: &str) -> String {
    percent_decode(
        path.trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or(path),
    )
}

pub fn parse_propfind(body: &str) -> Vec<Entry> {
    let mut reader = Reader::from_str(body);
    reader.config_mut().trim_text(true);
    let mut entries: Vec<Entry> = Vec::new();
    let mut current: Option<Entry> = None;
    let mut in_href = false;
    let mut in_display = false;
    let mut in_size = false;
    let mut text = String::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(name)) => {
                let name = name.local_name().as_ref().to_ascii_lowercase();
                match name.as_str() {
                    "response" => {
                        current = Some(Entry {
                            name: String::new(),
                            path: String::new(),
                            is_dir: false,
                            size: 0,
                        });
                    }
                    "href" => in_href = true,
                    "displayname" => in_display = true,
                    "getcontentlength" => in_size = true,
                    _ => {}
                }
                text.clear();
            }
            Ok(Event::Empty(name)) => {
                let name = name.local_name().as_ref().to_ascii_lowercase();
                if name == "collection" {
                    if let Some(entry) = current.as_mut() {
                        entry.is_dir = true;
                    }
                }
            }
            Ok(Event::Text(value)) => {
                if in_href || in_display || in_size {
                    text = decode(value.into_inner().as_ref());
                }
            }
            Ok(Event::End(name)) => {
                let name = name.local_name().as_ref().to_ascii_lowercase();
                match name.as_str() {
                    "href" => {
                        in_href = false;
                        if let Some(entry) = current.as_mut() {
                            entry.path = text.trim().to_owned();
                        }
                    }
                    "displayname" => {
                        in_display = false;
                        if let Some(entry) = current.as_mut() {
                            if !text.trim().is_empty() {
                                entry.name = decode(text.trim());
                            }
                        }
                    }
                    "getcontentlength" => {
                        in_size = false;
                        if let Some(entry) = current.as_mut() {
                            entry.size = text.trim().parse().unwrap_or(0);
                        }
                    }
                    "response" => {
                        if let Some(mut entry) = current.take() {
                            if entry.name.is_empty() {
                                entry.name = local_name(&entry.path);
                            }
                            if entry.name.is_empty() {
                                continue;
                            }
                            entries.push(entry);
                        }
                    }
                    _ => {}
                }
                text.clear();
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
    }
    entries
}

pub async fn list(http: &reqwest::Client, server: &Server, path: &str) -> Result<Vec<Entry>, String> {
    let base = server.url.trim().to_owned();
    if base.is_empty() {
        return Err("This server has no address.".to_owned());
    }
    let url = address(&base, path)?;
    let body = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>"#
    );
    let method = reqwest::Method::from_bytes(b"PROPFIND").map_err(|error| error.to_string())?;
    let mut request = http
        .request(method, &url)
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(body)
        .timeout(REQUEST_TIMEOUT);
    if let Some(auth) = basic_auth(&server.username, &server.password) {
        request = request.header("Authorization", auth);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("The server answered with {}", response.status().as_u16()));
    }
    let text = response.text().await.map_err(|error| error.to_string())?;
    Ok(parse_propfind(&text))
}

pub async fn read_range(
    http: &reqwest::Client,
    server: &Server,
    path: &str,
    from: u64,
    to: Option<u64>,
) -> Result<Chunk, String> {
    let url = address(&server.url, path)?;
    let mut request = http.get(&url).timeout(REQUEST_TIMEOUT);
    if let Some(auth) = basic_auth(&server.username, &server.password) {
        request = request.header("Authorization", auth);
    }
    let wanted = from > 0 || to.is_some();
    if wanted {
        let end = to.map_or_else(String::new, |value| value.to_string());
        request = request.header("Range", format!("bytes={from}-{end}"));
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("The server answered with {}", response.status().as_u16()));
    }
    let partial = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let total_from_header = response
        .headers()
        .get("content-range")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.rsplit_once('/'))
        .and_then(|(_, total)| total.trim().parse::<u64>().ok());
    let body = response.bytes().await.map_err(|error| error.to_string())?.to_vec();
    if !wanted {
        let total = body.len() as u64;
        return Ok(Chunk { bytes: body, total: Some(total) });
    }
    if partial {
        return Ok(Chunk { bytes: body, total: total_from_header });
    }
    let total = body.len() as u64;
    let start = from.min(total);
    let end = to.map_or(total, |value| value.saturating_add(1).min(total));
    Ok(Chunk {
        bytes: body[start as usize..end.max(start) as usize].to_vec(),
        total: Some(total),
    })
}

pub fn tracks_from(server: &Server, entries: Vec<Entry>) -> Vec<NetworkTrack> {
    entries
        .into_iter()
        .filter(|entry| !entry.is_dir && is_audio_name(&entry.name))
        .map(|entry| {
            let (title, artist) = title_from_name(&entry.name);
            NetworkTrack {
                id: super::track_id(&server.id, &entry.path),
                server_id: server.id.clone(),
                server_name: server.name.clone(),
                path: entry.path,
                name: entry.name.clone(),
                title: if title.is_empty() { entry.name.clone() } else { title },
                artist,
                album: String::new(),
                size: entry.size,
                cover_art: None,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::{Server, ServerKind};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    const BODY: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/Music/</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>Music</d:displayname>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/Music/song.mp3</d:href>
    <d:propstat>
      <d:prop>
        <d:displayname>song.mp3</d:displayname>
        <d:resourcetype/>
        <d:getcontentlength>4096</d:getcontentlength>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>"#;

    #[test]
    fn a_propfind_answer_gives_the_folders_and_the_files() {
        let entries = parse_propfind(BODY);
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "Music");
        assert_eq!(entries[1].name, "song.mp3");
        assert_eq!(entries[1].size, 4096);
        assert!(!entries[1].is_dir);
    }

    #[test]
    fn a_name_comes_from_the_path_when_there_is_no_display_name() {
        let body = r#"<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/a%20b.mp3</d:href></d:response></d:multistatus>"#;
        let entries = parse_propfind(body);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "a b.mp3");
    }
    async fn serve_once(response: &'static str) -> (String, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = vec![0u8; 8192];
            let read = socket.read(&mut buffer).await.unwrap();
            socket.write_all(response.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&buffer[..read]).lines().next().unwrap_or_default().to_owned()
        });
        (url, task)
    }

    #[tokio::test]
    async fn a_listing_is_sent_as_propfind() {
        let (url, task) = serve_once("HTTP/1.1 207 Multi-Status\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        let server = Server {
            url,
            ..test_server()
        };
        let http = reqwest::Client::new();
        list(&http, &server, "").await.unwrap();
        assert!(task.await.unwrap().starts_with("PROPFIND / "));
    }

    fn test_server() -> Server {
        Server {
            id: "s1".to_owned(),
            kind: ServerKind::WebDav,
            name: "Box".to_owned(),
            url: String::new(),
            host: String::new(),
            share: String::new(),
            path: String::new(),
            username: String::new(),
            password: String::new(),
            scanned_at: 0,
            song_count: 0,
            truncated: false,
        }
    }

    #[test]
    fn a_path_from_the_server_is_resolved_against_its_origin() {
        assert_eq!(
            address("https://box.example/remote.php/dav/files/me", "/remote.php/dav/files/me/a.mp3").unwrap(),
            "https://box.example/remote.php/dav/files/me/a.mp3"
        );
        assert_eq!(address("https://box.example/dav", "Music/song.mp3").unwrap(), "https://box.example/dav/Music/song.mp3");
        assert_eq!(address("https://box.example/dav", "").unwrap(), "https://box.example/dav/");
    }

    #[tokio::test]
    async fn a_file_is_read_from_its_href_once() {
        let (url, task) = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        let server = Server {
            url: format!("{url}/dav"),
            ..test_server()
        };
        let http = reqwest::Client::new();
        read_range(&http, &server, "/dav/song.mp3", 0, None).await.unwrap();
        assert!(task.await.unwrap().starts_with("GET /dav/song.mp3 "));
    }

    #[test]
    fn the_basic_auth_header_is_left_out_when_there_are_no_details() {
        assert!(basic_auth("", "").is_none());
        assert_eq!(basic_auth("me", "pw").as_deref(), Some("Basic bWU6cHc="));
    }

    #[test]
    fn only_audio_files_become_tracks() {
        let server = Server {
            id: "s1".to_owned(),
            kind: ServerKind::WebDav,
            name: "Box".to_owned(),
            url: "https://box.example".to_owned(),
            host: String::new(),
            share: String::new(),
            path: String::new(),
            username: String::new(),
            password: String::new(),
            scanned_at: 0,
            song_count: 0,
            truncated: false,
        };
        let tracks = tracks_from(
            &server,
            vec![
                Entry {
                    name: "Nova - Song.mp3".to_owned(),
                    path: "/dav/Nova - Song.mp3".to_owned(),
                    is_dir: false,
                    size: 10,
                },
                Entry {
                    name: "cover.jpg".to_owned(),
                    path: "/dav/cover.jpg".to_owned(),
                    is_dir: false,
                    size: 10,
                },
            ],
        );
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Song");
        assert_eq!(tracks[0].artist, "Nova");
        assert_eq!(tracks[0].id, "net:s1:/dav/Nova - Song.mp3");
    }
}

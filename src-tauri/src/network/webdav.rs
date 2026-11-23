use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use quick_xml::events::Event;
use quick_xml::Reader;

use super::{is_audio_name, title_from_name, NetworkTrack, Server};

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

fn join(base: &str, path: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    let rest = path.trim_start_matches('/');
    if rest.is_empty() {
        return trimmed.to_owned();
    }
    format!("{trimmed}/{rest}")
}

fn decode(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}
fn local_name(path: &str) -> String {
    path.trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .to_owned()
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
    let url = join(&base, path);
    let body = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>"#
    );
    let mut request = http
        .post(&url)
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
) -> Result<Vec<u8>, String> {
    let url = join(&server.url.trim(), path);
    let mut request = http.get(&url).timeout(REQUEST_TIMEOUT);
    if let Some(auth) = basic_auth(&server.username, &server.password) {
        request = request.header("Authorization", auth);
    }
    if from > 0 || to.is_some() {
        let end = to.map_or_else(String::new, |value| value.to_string());
        request = request.header("Range", format!("bytes={from}-{end}"));
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("The server answered with {}", response.status().as_u16()));
    }
    Ok(response.bytes().await.map_err(|error| error.to_string())?.to_vec())
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
        assert_eq!(entries[0].name, "a%20b.mp3");
    }
    #[test]
    fn the_address_and_the_path_are_joined_with_one_slash() {
        assert_eq!(join("https://box.example/dav", "Music/song.mp3"), "https://box.example/dav/Music/song.mp3");
        assert_eq!(join("https://box.example/dav/", "/Music"), "https://box.example/dav/Music");
        assert_eq!(join("https://box.example/dav", ""), "https://box.example/dav");
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

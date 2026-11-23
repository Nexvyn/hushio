use std::str::FromStr;

use futures_util::StreamExt;
use smb::resource::FileCreateArgs;
use smb::{Client, ClientConfig, GetLen, ReadAt, UncPath};
use smb_fscc::{FileAccessMask, FileDirectoryInformation};

use super::{is_audio_name, title_from_name, NetworkTrack, Server};

const READ_CHUNK: u64 = 64 * 1024;

pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn unc_of(server: &Server) -> Option<UncPath> {
    let host = server.host.trim();
    let share = server.share.trim();
    if host.is_empty() || share.is_empty() {
        return None;
    }
    UncPath::from_str(&format!(r"\\{host}\{share}")).ok()
}

fn with_path(base: &UncPath, path: &str) -> UncPath {
    let trimmed = path.trim_matches(['/', '\\']);
    if trimmed.is_empty() {
        return base.clone();
    }
    base.clone()
        .with_path(&trimmed.replace('\\', "/"))
}

async fn connect(server: &Server) -> Result<(Client, UncPath), String> {
    let base = unc_of(server).ok_or_else(|| "This server needs a host and a share.".to_owned())?;
    let client = Client::new(ClientConfig::default());
    client
        .share_connect(&base, &server.username, server.password.clone())
        .await
        .map_err(|error| error.to_string())?;
    Ok((client, base))
}

pub async fn list(server: &Server, path: &str) -> Result<Vec<Entry>, String> {
    let (client, base) = connect(server).await?;
    let folder = with_path(&base, path);
    let resource = client
        .create_file(
            &folder,
            &FileCreateArgs::make_open_existing(FileAccessMask::new().with_generic_read(true)),
        )
        .await
        .map_err(|error| error.to_string())?;
    let directory = std::sync::Arc::new(resource.unwrap_dir());
    let mut entries = Vec::new();
    let mut stream = smb::Directory::query::<FileDirectoryInformation>(&directory, "*")
        .await
        .map_err(|error| error.to_string())?;
    let prefix = path.trim_matches(['/', '\\']);
    while let Some(item) = stream.next().await {
        let Ok(item) = item else { continue };
        let name = item.file_name.to_string();
        if name == "." || name == ".." {
            continue;
        }
        let is_dir = item.file_attributes.directory();
        let child = if prefix.is_empty() {
            format!("/{name}")
        } else {
            format!("/{prefix}/{name}")
        };
        entries.push(Entry {
            name,
            path: child,
            is_dir,
            size: item.end_of_file,
        });
    }
    directory.close().await.ok();
    client.close().await.ok();
    Ok(entries)
}

pub async fn read(server: &Server, path: &str, from: u64, to: Option<u64>) -> Result<Vec<u8>, String> {
    let (client, base) = connect(server).await?;
    let target = with_path(&base, path);
    let resource = client
        .create_file(
            &target,
            &FileCreateArgs::make_open_existing(FileAccessMask::new().with_generic_read(true)),
        )
        .await
        .map_err(|error| error.to_string())?;
    let file = resource.unwrap_file();
    let size = file.get_len().await.map_err(|error| error.to_string())?;
    let last = size.saturating_sub(1);
    let end = to.unwrap_or(last).min(last);
    let mut bytes = Vec::new();
    let mut position = from;
    while position <= end {
        let want = READ_CHUNK.min(end - position + 1) as usize;
        let mut buffer = vec![0u8; want];
        let read = file
            .read_at(&mut buffer, position)
            .await
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        buffer.truncate(read);
        bytes.extend_from_slice(&buffer);
        position += read as u64;
    }
    file.close().await.ok();
    client.close().await.ok();
    Ok(bytes)
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
                title: if title.is_empty() { entry.name } else { title },
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
    fn server() -> Server {
        Server {
            id: "s1".to_owned(),
            kind: ServerKind::Smb,
            name: "Box".to_owned(),
            url: String::new(),
            host: "192.168.1.10".to_owned(),
            share: "music".to_owned(),
            path: String::new(),
            username: "me".to_owned(),
            password: "secret".to_owned(),
            scanned_at: 0,
            song_count: 0,
            truncated: false,
        }
    }

    #[test]
    fn a_server_without_a_host_or_a_share_is_refused() {
        let mut broken = server();
        broken.share = String::new();
        assert!(unc_of(&broken).is_none());
    }

    #[test]
    fn the_address_becomes_an_unc_path() {
        let unc = unc_of(&server()).expect("unc path");
        assert_eq!(unc.server(), "192.168.1.10");
        assert_eq!(unc.share(), Some("music"));
    }

    #[test]
    fn a_folder_path_is_joined_to_the_share() {
        let base = unc_of(&server()).expect("unc path");
        let child = with_path(&base, "Albums/One");
        assert_eq!(child.path(), Some("Albums\\One"));
    }

    #[test]
    fn an_empty_path_leaves_the_share_alone() {
        let base = unc_of(&server()).expect("unc path");
        assert_eq!(with_path(&base, "").path(), None);
    }

    #[test]
    fn only_audio_files_become_tracks() {
        let tracks = tracks_from(
            &server(),
            vec![
                Entry {
                    name: "Nova - Song.flac".to_owned(),
                    path: "/Nova - Song.flac".to_owned(),
                    is_dir: false,
                    size: 20,
                },
                Entry {
                    name: "notes.txt".to_owned(),
                    path: "/notes.txt".to_owned(),
                    is_dir: false,
                    size: 20,
                },
            ],
        );
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Song");
        assert_eq!(tracks[0].artist, "Nova");
        assert_eq!(tracks[0].id, "net:s1:/Nova - Song.flac");
    }
}

use serde::Deserialize;

use crate::android;
use crate::local_library::{LocalFolderEntry, LocalTrack, UNKNOWN_ALBUM, UNKNOWN_ARTIST, hash_path};

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TreeItem {
    pub uri: String,
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub mtime: i64,
    pub title: String,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub album: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub duration_ms: u64,
}

pub fn is_tree_uri(value: &str) -> bool {
    value.starts_with("content://") && value.contains("/tree/")
}

pub fn display_name(uri: &str) -> String {
    let raw = uri.split_once("/tree/").map_or("", |(_, rest)| rest);
    let decoded = url::form_urlencoded::parse(raw.as_bytes())
        .next()
        .map(|(key, _)| key.into_owned())
        .unwrap_or_default();
    let path = decoded.split_once(':').map_or(decoded.as_str(), |(_, rest)| rest);
    path
        .rsplit('/')
        .find(|part| !part.is_empty())
        .unwrap_or("Storage")
        .to_owned()
}

pub fn to_track(item: TreeItem) -> LocalTrack {
    let hash = hash_path(&item.uri);
    LocalTrack {
        id: format!("local:{hash}"),
        path: item.uri,
        title: item.title,
        artist: item.artist.unwrap_or_else(|| UNKNOWN_ARTIST.to_string()),
        album: item.album.unwrap_or_else(|| UNKNOWN_ALBUM.to_string()),
        genre: item.genre,
        duration: item.duration_ms as f64 / 1000.0,
        size: item.size,
        mtime: item.mtime,
        art: None,
        codec: None,
    }
}

pub fn scan_folders(folders: &[LocalFolderEntry]) -> Vec<LocalTrack> {
    let mut seen = std::collections::HashSet::new();
    let mut tracks = Vec::new();
    for folder in folders.iter().filter(|folder| is_tree_uri(&folder.path)) {
        match android::scan_tree(&folder.path) {
            Ok(items) => {
                for track in items.into_iter().map(to_track) {
                    if seen.insert(track.id.clone()) {
                        tracks.push(track);
                    }
                }
            }
            Err(error) => tracing::warn!(%error, "folder could not be scanned"),
        }
    }
    tracks
}

#[cfg(test)]
mod tests {
    use super::*;

    const TREE: &str = "content://com.android.externalstorage.documents/tree/primary%3AMusic%2FHushio";

    #[test]
    fn only_content_tree_uris_are_folders() {
        assert!(is_tree_uri(TREE));
        assert!(!is_tree_uri("content://com.android.externalstorage.documents/document/primary%3AMusic"));
        assert!(!is_tree_uri("C:/Music/tree/x"));
    }

    #[test]
    fn display_name_is_the_last_decoded_segment() {
        assert_eq!(display_name(TREE), "Hushio");
        assert_eq!(display_name("content://x/tree/primary%3AMusic"), "Music");
        assert_eq!(display_name("content://x/tree/primary%3A"), "Storage");
    }

    #[test]
    fn items_map_to_tracks_with_fallbacks() {
        let item = TreeItem {
            uri: format!("{TREE}/a.m4a"),
            name: "a.m4a".into(),
            size: 9,
            mtime: 5,
            title: "Blue Song".into(),
            artist: None,
            album: None,
            genre: Some("Rock".into()),
            duration_ms: 185_500,
        };
        let track = to_track(item.clone());
        assert_eq!(track.id, format!("local:{}", hash_path(&item.uri)));
        assert_eq!(track.path, item.uri);
        assert_eq!(track.artist, UNKNOWN_ARTIST);
        assert_eq!(track.album, UNKNOWN_ALBUM);
        assert_eq!(track.genre.as_deref(), Some("Rock"));
        assert!((track.duration - 185.5).abs() < 1e-9);
        assert_eq!((track.size, track.mtime), (9, 5));
    }

    #[test]
    fn scan_skips_plain_folders_without_calling_android() {
        let plain = LocalFolderEntry {
            path: "C:/Music".into(),
            name: "Music".into(),
            display_name: None,
            added_at: 1,
        };
        assert!(scan_folders(&[plain]).is_empty());
    }
}

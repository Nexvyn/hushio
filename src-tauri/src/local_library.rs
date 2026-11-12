use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use lofty::config::ParseOptions;
use lofty::file::{AudioFile, FileType, TaggedFileExt};
use lofty::tag::{Accessor, ItemKey};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::persist;
use crate::reveal::Folders;
use crate::tree_library;

pub const MIN_DURATION_SECS: f64 = 30.0;
pub const MAX_FOLDERS: usize = 200;
pub const MAX_OPENED: usize = 200;
pub const ART_DIR: &str = "local-art";
const MAX_DEPTH: usize = 8;
const MAX_TAG_CHARS: usize = 200;
const MAX_NAME_CHARS: usize = 80;
const MAX_ART_BYTES: usize = 8 * 1024 * 1024;
const OWNER: &str = "local";
const LIBRARY_STORE: &str = "local-library";
const OPENED_STORE: &str = "opened-files";
pub(crate) const UNKNOWN_ARTIST: &str = "Unknown artist";
pub(crate) const UNKNOWN_ALBUM: &str = "Unknown album";
const PLAYABLE_EXTENSIONS: [&str; 9] = ["mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "wav", "webm"];
const UNPLAYABLE_EXTENSIONS: [(&str, &str); 4] = [("wma", "WMA"), ("aiff", "AIFF"), ("aif", "AIFF"), ("aifc", "AIFF")];
const NON_MUSIC_PATHS: [&str; 14] = [
    "recordings",
    "voice recorder",
    "sound_recorder",
    "voicenotes",
    "whatsapp voice notes",
    "telegram",
    "screen recorder",
    "call recordings",
    "call_rec",
    "alarms",
    "notifications",
    "ringtones",
    "podcasts",
    "audiobooks",
];
const NON_MUSIC_NAMES: [&str; 8] = ["voice", "recording", "record_", "call_", "memo", "note", "audio_", "clip"];

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFolderEntry {
    pub path: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    pub added_at: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrack {
    pub id: String,
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    pub duration: f64,
    pub size: u64,
    pub mtime: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub art: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub codec: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Unplayable {
    pub format: String,
    pub count: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibrary {
    pub folders: Vec<LocalFolderEntry>,
    pub scanned_at: u64,
    pub tracks: Vec<LocalTrack>,
    pub unplayable: Vec<Unplayable>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddResult {
    pub lib: LocalLibrary,
    pub added: Vec<LocalFolderEntry>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStatus {
    pub path: String,
    pub exists: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenResult {
    pub tracks: Vec<LocalTrack>,
    pub folders: Vec<String>,
    pub unplayable: Vec<String>,
}

struct Candidate {
    abs: PathBuf,
    rel: String,
}

#[derive(Default)]
struct Parsed {
    title: Option<String>,
    artist: Option<String>,
    album_artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    duration: f64,
    codec: Option<String>,
    picture: Option<(Vec<u8>, bool)>,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

pub fn hash_path(path: &str) -> String {
    let digest = Sha1::digest(path.to_lowercase().as_bytes());
    format!("{digest:x}")[..16].to_string()
}

pub fn folder_key(path: &str) -> String {
    path.to_lowercase()
}

fn norm_child(path: &str) -> String {
    path.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

pub fn is_under_path(child: &str, root: &str) -> bool {
    let child = norm_child(child);
    let root = norm_child(root);
    if root.is_empty() {
        return false;
    }
    child == root || child.starts_with(&format!("{root}/"))
}

fn extension(name: &str) -> Option<String> {
    Path::new(name).extension().map(|ext| ext.to_string_lossy().to_lowercase())
}

pub fn is_playable_name(name: &str) -> bool {
    extension(name).is_some_and(|ext| PLAYABLE_EXTENSIONS.contains(&ext.as_str()))
}

pub fn unplayable_format(name: &str) -> Option<&'static str> {
    let ext = extension(name)?;
    UNPLAYABLE_EXTENSIONS
        .iter()
        .find(|(known, _)| *known == ext)
        .map(|(_, format)| *format)
}

fn is_known_audio(name: &str) -> bool {
    is_playable_name(name) || unplayable_format(name).is_some()
}

fn codec_format(codec: Option<&str>) -> Option<&'static str> {
    match codec {
        Some("alac") => Some("ALAC"),
        _ => None,
    }
}

pub fn is_non_music(rel_path: &str, file_name: &str) -> bool {
    let rel = rel_path.replace('\\', "/").to_lowercase();
    if NON_MUSIC_PATHS.iter().any(|fragment| rel.contains(fragment)) {
        return true;
    }
    let name = file_name.to_lowercase();
    NON_MUSIC_NAMES
        .iter()
        .any(|word| name.starts_with(word) || name.contains(&format!(" {word} ")))
}

pub fn title_from_file(file_name: &str) -> (Option<String>, String) {
    let stem = match file_name.rfind('.') {
        Some(index) if index > 0 => &file_name[..index],
        _ => file_name,
    };
    let cleaned = stem.replace('_', " ");
    let stem = cleaned.trim();
    if let Some((index, separator)) = stem.char_indices().find(|(_, c)| *c == '-' || *c == '–') {
        let artist = stem[..index].trim();
        let title = stem[index + separator.len_utf8()..].trim();
        if !artist.is_empty() && !title.is_empty() {
            return (Some(artist.to_string()), title.to_string());
        }
    }
    (None, stem.to_string())
}

pub fn is_art_name(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    (ext == "jpg" || ext == "png")
        && stem.len() == 16
        && stem.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn art_mime(name: &str) -> &'static str {
    if name.ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    }
}

pub fn serve_art(art_dir: &Path, path: &str) -> tauri::http::Response<Vec<u8>> {
    let name = path.trim_start_matches('/');
    let bytes = is_art_name(name).then(|| fs::read(art_dir.join(name)).ok()).flatten();
    match bytes {
        Some(bytes) => tauri::http::Response::builder()
            .header("Content-Type", art_mime(name))
            .body(bytes)
            .unwrap_or_else(|_| not_found()),
        None => not_found(),
    }
}

fn not_found() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(tauri::http::StatusCode::NOT_FOUND)
        .body(Vec::new())
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

pub fn normalize_folder(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut text = std::path::absolute(trimmed).ok()?.to_string_lossy().into_owned();
    while text.len() > 3 && (text.ends_with('\\') || text.ends_with('/')) {
        text.pop();
    }
    Some(text)
}

fn base_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn collect(dir: &Path, base: &Path, depth: usize, seen: &mut HashSet<String>, out: &mut Vec<Candidate>) {
    if depth > MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if kind.is_dir() {
            collect(&path, base, depth + 1, seen, out);
        } else if kind.is_file() && is_known_audio(&name) && seen.insert(path.to_string_lossy().to_lowercase()) {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().into_owned();
            out.push(Candidate { abs: path, rel });
        }
    }
}

fn contains_playable(dir: &Path, base: &Path, depth: usize) -> bool {
    if depth > MAX_DEPTH {
        return false;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if is_hidden(&name) {
            continue;
        }
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if kind.is_dir() {
            if contains_playable(&path, base, depth + 1) {
                return true;
            }
        } else if kind.is_file() && is_playable_name(&name) {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().into_owned();
            if !is_non_music(&rel, &name) {
                return true;
            }
        }
    }
    false
}

fn music_subfolders(root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut subs: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| !is_hidden(&entry.file_name().to_string_lossy()))
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .map(|entry| entry.path())
        .filter(|path| contains_playable(path, path, 0))
        .collect();
    subs.sort_by_key(|path| base_name(&path.to_string_lossy()).to_lowercase());
    subs
}

fn store_folder(lib: &mut LocalLibrary, path: &str, name: String, now: u64, added: &mut Vec<LocalFolderEntry>, skipped: &mut Vec<String>) {
    let key = folder_key(path);
    if lib.folders.len() >= MAX_FOLDERS || lib.folders.iter().any(|folder| folder_key(&folder.path) == key) {
        skipped.push(path.to_string());
        return;
    }
    let entry = LocalFolderEntry {
        path: path.to_string(),
        name,
        display_name: None,
        added_at: now,
    };
    lib.folders.push(entry.clone());
    added.push(entry);
}

pub fn add_folders(lib: &mut LocalLibrary, inputs: &[String], now: u64) -> (Vec<LocalFolderEntry>, Vec<String>) {
    let mut added = Vec::new();
    let mut skipped = Vec::new();
    for raw in inputs.iter().take(MAX_FOLDERS) {
        if tree_library::is_tree_uri(raw) {
            let name = tree_library::display_name(raw);
            store_folder(lib, raw, name, now, &mut added, &mut skipped);
            continue;
        }
        let Some(norm) = normalize_folder(raw) else {
            continue;
        };
        if !Path::new(&norm).is_dir() {
            skipped.push(norm);
            continue;
        }
        store_folder(lib, &norm, base_name(&norm), now, &mut added, &mut skipped);
        let key = folder_key(&norm);
        if lib.folders.iter().any(|folder| folder_key(&folder.path) == key) {
            for sub in music_subfolders(Path::new(&norm)) {
                store_folder(lib, &sub.to_string_lossy(), base_name(&sub.to_string_lossy()), now, &mut added, &mut skipped);
            }
        }
    }
    (added, skipped)
}

pub fn remove_folder(lib: &mut LocalLibrary, raw: &str) -> bool {
    let key = folder_key(&normalize_folder(raw).unwrap_or_else(|| raw.to_string()));
    let Some(index) = lib.folders.iter().position(|folder| folder_key(&folder.path) == key) else {
        return false;
    };
    lib.folders.remove(index);
    let folders = &lib.folders;
    lib.tracks
        .retain(|track| folders.iter().any(|folder| is_under_path(&track.path, &folder.path)));
    true
}

pub fn rename_folder(lib: &mut LocalLibrary, raw: &str, display_name: &str) -> bool {
    let key = folder_key(&normalize_folder(raw).unwrap_or_else(|| raw.to_string()));
    let Some(folder) = lib.folders.iter_mut().find(|folder| folder_key(&folder.path) == key) else {
        return false;
    };
    let name: String = display_name.trim().chars().take(MAX_NAME_CHARS).collect();
    folder.display_name = (!name.is_empty()).then_some(name);
    true
}

fn bounded(value: &str) -> String {
    value.chars().take(MAX_TAG_CHARS).collect()
}

fn clean(value: &str) -> Option<String> {
    let text = bounded(value);
    (!text.trim().is_empty()).then_some(text)
}

fn parse(path: &Path) -> Option<Parsed> {
    let tagged = lofty::read_from_path(path).ok()?;
    let file_type = tagged.file_type();
    let mut parsed = Parsed {
        duration: tagged.properties().duration().as_secs_f64(),
        codec: Some(format!("{file_type:?}").to_lowercase()),
        ..Parsed::default()
    };
    if file_type == FileType::Mp4 {
        let mut file = fs::File::open(path).ok()?;
        let mp4 = lofty::mp4::Mp4File::read_from(&mut file, ParseOptions::new()).ok()?;
        if matches!(mp4.properties().codec(), lofty::mp4::Mp4Codec::ALAC) {
            parsed.codec = Some("alac".to_string());
        }
    }
    if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
        parsed.title = tag.title().and_then(|value| clean(&value));
        parsed.artist = tag.artist().and_then(|value| clean(&value));
        parsed.album_artist = tag.get_string(&ItemKey::AlbumArtist).and_then(clean);
        parsed.album = tag.album().and_then(|value| clean(&value));
        parsed.genre = tag.genre().and_then(|value| clean(&value));
        parsed.picture = tag
            .pictures()
            .first()
            .map(|picture| (picture.data().to_vec(), picture.mime_type().is_some_and(|mime| mime.as_str() == "image/png")));
    }
    Some(parsed)
}

fn save_art(art_dir: &Path, hash: &str, data: &[u8], png: bool) -> Option<String> {
    if data.is_empty() || data.len() > MAX_ART_BYTES {
        return None;
    }
    fs::create_dir_all(art_dir).ok()?;
    let ext = if png { "png" } else { "jpg" };
    for stale in ["jpg", "png"] {
        let _ = fs::remove_file(art_dir.join(format!("{hash}.{stale}")));
    }
    let name = format!("{hash}.{ext}");
    fs::write(art_dir.join(&name), data).ok()?;
    Some(format!("localart://{name}"))
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

pub fn read_track(path: &Path, size: u64, mtime: i64, art_dir: &Path) -> LocalTrack {
    let (guessed_artist, guessed_title) = title_from_file(&base_name(&path.to_string_lossy()));
    let path_text = path.to_string_lossy().into_owned();
    let hash = hash_path(&path_text);
    let mut track = LocalTrack {
        id: format!("local:{hash}"),
        path: path_text,
        title: guessed_title,
        artist: guessed_artist.unwrap_or_else(|| UNKNOWN_ARTIST.to_string()),
        album: UNKNOWN_ALBUM.to_string(),
        genre: None,
        duration: 0.0,
        size,
        mtime,
        art: None,
        codec: None,
    };
    let Some(parsed) = parse(path) else {
        return track;
    };
    if let Some(title) = parsed.title {
        track.title = title;
    }
    if let Some(artist) = parsed.artist.or(parsed.album_artist) {
        track.artist = artist;
    }
    if let Some(album) = parsed.album {
        track.album = album;
    }
    track.genre = parsed.genre;
    track.duration = parsed.duration.round();
    track.codec = parsed.codec;
    track.art = parsed
        .picture
        .and_then(|(data, png)| save_art(art_dir, &hash, &data, png));
    track
}

pub fn scan(
    folders: &[LocalFolderEntry],
    previous: &[LocalTrack],
    filter_non_music: bool,
    art_dir: &Path,
) -> (Vec<LocalTrack>, Vec<Unplayable>) {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();
    for folder in folders {
        let root = Path::new(&folder.path);
        collect(root, root, 0, &mut seen, &mut candidates);
    }

    let cache: HashMap<&str, &LocalTrack> = previous.iter().map(|track| (track.path.as_str(), track)).collect();
    let mut tracks = Vec::new();
    let mut counts: BTreeMap<&'static str, u32> = BTreeMap::new();
    for candidate in candidates {
        let Ok(meta) = fs::metadata(&candidate.abs) else {
            continue;
        };
        let name = base_name(&candidate.abs.to_string_lossy());
        let path = candidate.abs.to_string_lossy().into_owned();
        let mtime = mtime_ms(&meta);

        if let Some(cached) = cache.get(path.as_str()) {
            if cached.mtime == mtime && cached.codec.is_some() {
                match codec_format(cached.codec.as_deref()) {
                    Some(format) => *counts.entry(format).or_default() += 1,
                    None => tracks.push((*cached).clone()),
                }
                continue;
            }
        }
        if let Some(format) = unplayable_format(&name) {
            *counts.entry(format).or_default() += 1;
            continue;
        }
        let track = read_track(&candidate.abs, meta.len(), mtime, art_dir);
        if let Some(format) = codec_format(track.codec.as_deref()) {
            *counts.entry(format).or_default() += 1;
            continue;
        }
        if track.duration < MIN_DURATION_SECS {
            continue;
        }
        if filter_non_music && is_non_music(&candidate.rel, &name) {
            continue;
        }
        tracks.push(track);
    }

    let unplayable = counts
        .into_iter()
        .map(|(format, count)| Unplayable {
            format: format.to_string(),
            count,
        })
        .collect();
    (tracks, unplayable)
}

fn open_paths(paths: &[String], art_dir: &Path) -> OpenResult {
    let mut result = OpenResult::default();
    for raw in paths {
        let Some(abs) = normalize_folder(raw).map(PathBuf::from) else {
            continue;
        };
        let Ok(meta) = fs::metadata(&abs) else {
            continue;
        };
        if meta.is_dir() {
            result.folders.push(abs.to_string_lossy().into_owned());
            continue;
        }
        let name = base_name(&abs.to_string_lossy());
        if !is_known_audio(&name) {
            continue;
        }
        if let Some(format) = unplayable_format(&name) {
            result.unplayable.push(format.to_string());
            continue;
        }
        let track = read_track(&abs, meta.len(), mtime_ms(&meta), art_dir);
        if let Some(format) = codec_format(track.codec.as_deref()) {
            result.unplayable.push(format.to_string());
            continue;
        }
        result.tracks.push(track);
    }
    result
}

fn prepend_opened(opened: &[LocalTrack], fresh: &[LocalTrack]) -> Vec<LocalTrack> {
    let ids: HashSet<&str> = fresh.iter().map(|track| track.id.as_str()).collect();
    let mut next: Vec<LocalTrack> = fresh.to_vec();
    next.extend(opened.iter().filter(|track| !ids.contains(track.id.as_str())).cloned());
    next.truncate(MAX_OPENED);
    next
}

pub struct Service {
    root: PathBuf,
    library: tokio::sync::Mutex<LocalLibrary>,
    opened: tokio::sync::Mutex<Vec<LocalTrack>>,
}

impl Service {
    pub async fn load(root: PathBuf) -> Self {
        let library = read_store(&root, LIBRARY_STORE).await;
        let opened = read_store(&root, OPENED_STORE).await;
        Self {
            root,
            library: tokio::sync::Mutex::new(library),
            opened: tokio::sync::Mutex::new(opened),
        }
    }

    pub fn art_dir(&self) -> PathBuf {
        self.root.join(ART_DIR)
    }

    pub async fn library(&self) -> LocalLibrary {
        self.library.lock().await.clone()
    }

    async fn save_library(&self, lib: &LocalLibrary) -> Result<(), String> {
        write_store(&self.root, LIBRARY_STORE, lib).await
    }

    pub async fn add_folders(&self, inputs: Vec<String>) -> Result<AddResult, String> {
        let mut lib = self.library.lock().await;
        let (added, skipped) = add_folders(&mut lib, &inputs, now_ms());
        if !added.is_empty() {
            self.save_library(&lib).await?;
        }
        Ok(AddResult {
            lib: lib.clone(),
            added,
            skipped,
        })
    }

    pub async fn scan(&self, filter_non_music: bool, approvals: &Folders) -> Result<LocalLibrary, String> {
        let mut lib = self.library.lock().await;
        let folders = approved_folders(approvals, &lib.folders);
        let previous = lib.tracks.clone();
        let art_dir = self.art_dir();
        let (tracks, unplayable) = tokio::task::spawn_blocking(move || {
            let (mut tracks, unplayable) = scan(&folders, &previous, filter_non_music, &art_dir);
            tracks.extend(tree_library::scan_folders(&folders));
            (tracks, unplayable)
        })
            .await
            .map_err(|error| error.to_string())?;
        lib.tracks = tracks;
        lib.unplayable = unplayable;
        lib.scanned_at = now_ms();
        self.save_library(&lib).await?;
        Ok(lib.clone())
    }

    pub async fn remove_folder(&self, path: &str) -> Result<LocalLibrary, String> {
        let mut lib = self.library.lock().await;
        if remove_folder(&mut lib, path) {
            self.save_library(&lib).await?;
        }
        Ok(lib.clone())
    }

    pub async fn rename_folder(&self, path: &str, display_name: &str) -> Result<LocalLibrary, String> {
        let mut lib = self.library.lock().await;
        if rename_folder(&mut lib, path, display_name) {
            self.save_library(&lib).await?;
        }
        Ok(lib.clone())
    }

    pub async fn folder_statuses(&self) -> Vec<FolderStatus> {
        self.library
            .lock()
            .await
            .folders
            .iter()
            .map(|folder| FolderStatus {
                path: folder.path.clone(),
                exists: Path::new(&folder.path).is_dir(),
            })
            .collect()
    }

    pub async fn opened(&self) -> Vec<LocalTrack> {
        self.opened.lock().await.clone()
    }

    pub async fn open_files(&self, paths: Vec<String>) -> Result<OpenResult, String> {
        let art_dir = self.art_dir();
        let result = tokio::task::spawn_blocking(move || open_paths(&paths, &art_dir))
            .await
            .map_err(|error| error.to_string())?;
        let mut opened = self.opened.lock().await;
        *opened = prepend_opened(&opened, &result.tracks);
        write_store(&self.root, OPENED_STORE, &*opened).await?;
        Ok(result)
    }

    pub async fn forget_opened(&self, id: &str) -> Result<Vec<LocalTrack>, String> {
        let mut opened = self.opened.lock().await;
        opened.retain(|track| track.id != id);
        write_store(&self.root, OPENED_STORE, &*opened).await?;
        Ok(opened.clone())
    }

    pub async fn track_path(&self, id: &str) -> Option<String> {
        let found = self.library.lock().await.tracks.iter().find(|track| track.id == id).cloned();
        let found = match found {
            Some(track) => Some(track),
            None => self.opened.lock().await.iter().find(|track| track.id == id).cloned(),
        };
        found.map(|track| track.path)
    }
}

fn approved_folders(approvals: &Folders, folders: &[LocalFolderEntry]) -> Vec<LocalFolderEntry> {
    folders
        .iter()
        .filter(|folder| match approvals.check(Path::new(&folder.path)) {
            Ok(()) => true,
            Err(error) => {
                tracing::warn!(%error, path = %folder.path, "skipped a library folder that is not approved");
                false
            }
        })
        .cloned()
        .collect()
}

pub async fn stored_folder_paths(root: &Path) -> Vec<PathBuf> {
    read_store::<LocalLibrary>(root, LIBRARY_STORE)
        .await
        .folders
        .into_iter()
        .map(|folder| PathBuf::from(folder.path))
        .collect()
}

async fn read_store<T: Default + for<'de> Deserialize<'de>>(root: &Path, name: &str) -> T {
    let Some(value) = persist::read(root, OWNER, name).await else {
        return T::default();
    };
    serde_json::from_value(value).unwrap_or_else(|error| {
        tracing::warn!(%error, store = name, "local store has an unexpected shape");
        T::default()
    })
}

async fn write_store<T: Serialize + ?Sized>(root: &Path, name: &str, value: &T) -> Result<(), String> {
    let json = serde_json::to_value(value).map_err(|error| error.to_string())?;
    persist::write(root, OWNER, name, &json).await
}

#[cfg(desktop)]
mod watch;
#[cfg(desktop)]
pub use watch::{start_watching, sync_watches};

#[cfg(not(desktop))]
pub fn start_watching(_app: &tauri::AppHandle) {}

#[cfg(not(desktop))]
pub async fn sync_watches(_app: &tauri::AppHandle) {}

#[cfg(test)]
mod tests;

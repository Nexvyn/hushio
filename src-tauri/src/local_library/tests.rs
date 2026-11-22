use super::*;
use std::path::Path;

fn write_wav(path: &Path, seconds: u32) {
    let rate: u32 = 8000;
    let data_len = rate * seconds * 2;
    let mut bytes = Vec::with_capacity(44 + data_len as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&rate.to_le_bytes());
    bytes.extend_from_slice(&(rate * 2).to_le_bytes());
    bytes.extend_from_slice(&2u16.to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_len.to_le_bytes());
    bytes.resize(44 + data_len as usize, 0);
    fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
    fs::write(path, bytes).expect("write wav");
}

fn folder_entry(path: &Path) -> LocalFolderEntry {
    LocalFolderEntry {
        path: path.to_string_lossy().into_owned(),
        name: base_name(&path.to_string_lossy()),
        display_name: None,
        added_at: 1,
    }
}

fn names(tracks: &[LocalTrack]) -> Vec<String> {
    let mut names: Vec<String> = tracks.iter().map(|track| track.title.clone()).collect();
    names.sort();
    names
}

fn scan_root(root: &Path, filter: bool) -> (Vec<LocalTrack>, Vec<Unplayable>) {
    let art = root.join(ART_DIR);
    scan(&[folder_entry(root)], &[], filter, &art)
}

async fn approvals_for(base: &Path, library: &[PathBuf]) -> Folders {
    let folders = Folders::open(&base.join("data"), base.join("Downloads"), None).await;
    folders.approve_library(library.to_vec());
    folders
}

#[test]
fn hash_path_is_sixteen_lowercase_hex_and_ignores_case() {
    let hash = hash_path("C:\\Music\\Album");
    assert_eq!(hash.len(), 16);
    assert!(hash.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)));
    assert_eq!(hash, hash_path("c:\\music\\album"));
    assert_ne!(hash, hash_path("C:\\Music\\Other"));
}

#[test]
fn under_path_matches_the_folder_and_its_children_only() {
    assert!(is_under_path("/music/a/b.mp3", "/music"));
    assert!(is_under_path("/MUSIC/a.mp3", "/music/"));
    assert!(is_under_path("C:\\Music\\a.mp3", "C:/Music"));
    assert!(!is_under_path("/music2/a.mp3", "/music"));
    assert!(!is_under_path("/music/a.mp3", ""));
}

#[test]
fn title_from_file_splits_artist_and_title() {
    assert_eq!(
        title_from_file("Daft Punk - Around_the World.mp3"),
        (Some("Daft Punk".to_string()), "Around the World".to_string())
    );
    assert_eq!(
        title_from_file("Artist – Title.flac"),
        (Some("Artist".to_string()), "Title".to_string())
    );
    assert_eq!(title_from_file("plain_song.mp3"), (None, "plain song".to_string()));
    assert_eq!(title_from_file("- Leading.mp3"), (None, "- Leading".to_string()));
    assert_eq!(title_from_file("Only Artist -.mp3"), (None, "Only Artist -".to_string()));
}

#[test]
fn non_music_rules_match_paths_and_names() {
    assert!(is_non_music("Recordings\\take.m4a", "take.m4a"));
    assert!(is_non_music("WhatsApp Voice Notes/clip.opus", "clip.opus"));
    assert!(is_non_music("Music/Podcasts/x.mp3", "x.mp3"));
    assert!(is_non_music("Music/a.mp3", "Voice Memo.mp3"));
    assert!(is_non_music("Music/a.mp3", "call_2024.mp3"));
    assert!(is_non_music("Music/a.mp3", "a clip mix.mp3"));
    assert!(!is_non_music("Music/Album/Song.mp3", "Song.mp3"));
    assert!(!is_non_music("Music/Album/Some Song.mp3", "Some Song.mp3"));
}

#[test]
fn unplayable_formats_are_recognised_by_extension() {
    assert_eq!(unplayable_format("Track.WMA"), Some("WMA"));
    assert_eq!(unplayable_format("Track.aiff"), Some("AIFF"));
    assert_eq!(unplayable_format("Track.aif"), Some("AIFF"));
    assert_eq!(unplayable_format("Track.aifc"), Some("AIFF"));
    assert_eq!(unplayable_format("Track.mp3"), None);
    assert_eq!(unplayable_format("Track"), None);
    assert!(is_known_audio("Track.wma"));
    assert!(!is_known_audio("cover.jpg"));
    assert_eq!(codec_format(Some("alac")), Some("ALAC"));
    assert_eq!(codec_format(Some("aac")), None);
}

#[test]
fn art_names_must_be_hash_plus_image_extension() {
    assert!(is_art_name("0123456789abcdef.jpg"));
    assert!(is_art_name("0123456789abcdef.png"));
    assert!(!is_art_name("0123456789ABCDEF.jpg"));
    assert!(!is_art_name("0123456789abcdef.gif"));
    assert!(!is_art_name("../0123456789abcdef.jpg"));
    assert!(!is_art_name("0123456789abcde.jpg"));
}

#[test]
fn normalize_folder_trims_and_rejects_blank_input() {
    let temp = tempfile::tempdir().expect("temp");
    let raw = format!("  {}\\  ", temp.path().display());
    let normalized = normalize_folder(&raw).expect("folder");
    assert!(!normalized.ends_with('\\'));
    assert_eq!(normalize_folder("   "), None);
}

#[test]
fn add_folders_pins_music_subfolders_and_skips_the_rest() {
    let temp = tempfile::tempdir().expect("temp");
    let root = temp.path().join("Music");
    write_wav(&root.join("Album One").join("long.wav"), 31);
    write_wav(&root.join("Loose.wav"), 31);
    fs::create_dir_all(root.join("Empty")).expect("dirs");
    let file = root.join("Loose.wav");
    let mut lib = LocalLibrary::default();

    let inputs = vec![
        root.to_string_lossy().into_owned(),
        file.to_string_lossy().into_owned(),
    ];
    let (added, skipped) = add_folders(&mut lib, &inputs, 7);
    let paths: Vec<String> = added.iter().map(|folder| folder.path.clone()).collect();
    assert_eq!(paths.len(), 2, "{paths:?}");
    assert!(paths.iter().any(|path| path.ends_with("Album One")));
    assert!(paths.iter().all(|path| !path.ends_with("Empty")));
    assert_eq!(skipped, vec![normalize_folder(&inputs[1]).expect("norm")]);
    assert!(added.iter().all(|folder| folder.added_at == 7));

    let (again, skipped_again) = add_folders(&mut lib, &inputs[..1], 8);
    assert!(again.is_empty());
    assert_eq!(skipped_again.len(), 2);
    assert_eq!(lib.folders.len(), 2);
}

#[test]
fn scan_keeps_tracks_of_thirty_seconds_or_more() {
    let temp = tempfile::tempdir().expect("temp");
    write_wav(&temp.path().join("Long Song.wav"), 31);
    write_wav(&temp.path().join("Short Clip.wav"), 5);
    let (tracks, unplayable) = scan_root(temp.path(), true);
    assert_eq!(names(&tracks), vec!["Long Song".to_string()]);
    assert!(unplayable.is_empty());
    assert_eq!(tracks[0].duration, 31.0);
    assert_eq!(tracks[0].artist, UNKNOWN_ARTIST);
    assert_eq!(tracks[0].album, UNKNOWN_ALBUM);
    assert!(tracks[0].id.starts_with("local:"));
    assert_eq!(tracks[0].id, format!("local:{}", hash_path(&tracks[0].path)));
}

#[test]
fn scan_reads_artist_from_the_file_name_when_tags_are_missing() {
    let temp = tempfile::tempdir().expect("temp");
    write_wav(&temp.path().join("Nina - Blue Hour.wav"), 40);
    let (tracks, _) = scan_root(temp.path(), true);
    assert_eq!(tracks[0].artist, "Nina");
    assert_eq!(tracks[0].title, "Blue Hour");
    assert!(tracks[0].codec.is_some());
}

#[test]
fn scan_counts_unplayable_formats_and_leaves_them_out() {
    let temp = tempfile::tempdir().expect("temp");
    fs::write(temp.path().join("old.wma"), b"not audio").expect("write");
    fs::write(temp.path().join("one.aiff"), b"not audio").expect("write");
    fs::write(temp.path().join("two.aif"), b"not audio").expect("write");
    let (tracks, unplayable) = scan_root(temp.path(), true);
    assert!(tracks.is_empty());
    assert_eq!(
        unplayable,
        vec![
            Unplayable {
                format: "AIFF".to_string(),
                count: 2
            },
            Unplayable {
                format: "WMA".to_string(),
                count: 1
            },
        ]
    );
}

#[test]
fn scan_hides_non_music_only_when_the_filter_is_on() {
    let temp = tempfile::tempdir().expect("temp");
    write_wav(&temp.path().join("Voice Memo.wav"), 40);
    write_wav(&temp.path().join("Recordings").join("take.wav"), 40);
    write_wav(&temp.path().join("Keeper.wav"), 40);
    let (filtered, _) = scan_root(temp.path(), true);
    assert_eq!(names(&filtered), vec!["Keeper".to_string()]);
    let (everything, _) = scan_root(temp.path(), false);
    assert_eq!(everything.len(), 3);
}

#[test]
fn scan_skips_hidden_folders_and_directories_past_the_depth_limit() {
    let temp = tempfile::tempdir().expect("temp");
    write_wav(&temp.path().join(".hidden").join("secret.wav"), 40);
    let mut deep_ok = temp.path().to_path_buf();
    for depth in 1..=MAX_DEPTH {
        deep_ok = deep_ok.join(format!("d{depth}"));
    }
    write_wav(&deep_ok.join("reached.wav"), 40);
    write_wav(&deep_ok.join("d9").join("missed.wav"), 40);
    let (tracks, _) = scan_root(temp.path(), true);
    assert_eq!(names(&tracks), vec!["reached".to_string()]);
}

#[test]
fn scan_counts_a_track_once_when_parent_and_child_are_both_imported() {
    let temp = tempfile::tempdir().expect("temp");
    let child = temp.path().join("Album");
    write_wav(&child.join("Only.wav"), 40);
    let folders = vec![folder_entry(temp.path()), folder_entry(&child)];
    let (tracks, _) = scan(&folders, &[], true, &temp.path().join(ART_DIR));
    assert_eq!(tracks.len(), 1);
}

#[test]
fn scan_reuses_cached_tracks_whose_file_is_unchanged() {
    let temp = tempfile::tempdir().expect("temp");
    let file = temp.path().join("Cached.wav");
    write_wav(&file, 40);
    let (first, _) = scan_root(temp.path(), true);
    let mut edited = first.clone();
    edited[0].title = "From Cache".to_string();
    let folders = [folder_entry(temp.path())];
    let (second, _) = scan(&folders, &edited, true, &temp.path().join(ART_DIR));
    assert_eq!(second[0].title, "From Cache");

    edited[0].mtime = 0;
    let (third, _) = scan(&folders, &edited, true, &temp.path().join(ART_DIR));
    assert_eq!(third[0].title, "Cached");
}

#[test]
#[cfg(windows)]
fn remove_folder_drops_only_its_tracks() {
    let mut lib = LocalLibrary {
        folders: vec![
            LocalFolderEntry {
                path: "C:\\Music\\A".into(),
                name: "A".into(),
                display_name: None,
                added_at: 1,
            },
            LocalFolderEntry {
                path: "D:\\Other".into(),
                name: "Other".into(),
                display_name: None,
                added_at: 1,
            },
        ],
        tracks: vec![
            LocalTrack {
                id: "local:a".into(),
                path: "C:\\Music\\A\\one.mp3".into(),
                title: "one".into(),
                artist: "x".into(),
                album: "y".into(),
                genre: None,
                duration: 40.0,
                size: 1,
                mtime: 1,
                art: None,
                codec: None,
                ..LocalTrack::default()
            },
            LocalTrack {
                id: "local:b".into(),
                path: "D:\\Other\\two.mp3".into(),
                title: "two".into(),
                artist: "x".into(),
                album: "y".into(),
                genre: None,
                duration: 40.0,
                size: 1,
                mtime: 1,
                art: None,
                codec: None,
                ..LocalTrack::default()
            },
        ],
        ..LocalLibrary::default()
    };
    assert!(!remove_folder(&mut lib, "C:\\Nope"));
    assert!(remove_folder(&mut lib, "c:\\music\\a\\"));
    assert_eq!(lib.folders.len(), 1);
    assert_eq!(lib.tracks.len(), 1);
    assert_eq!(lib.tracks[0].id, "local:b");
}

#[test]
#[cfg(windows)]
fn rename_folder_trims_caps_and_clears() {
    let mut lib = LocalLibrary {
        folders: vec![folder_entry(Path::new("C:\\Music"))],
        ..LocalLibrary::default()
    };
    assert!(rename_folder(&mut lib, "C:\\Music", "  Favourites  "));
    assert_eq!(lib.folders[0].display_name.as_deref(), Some("Favourites"));
    let long = "x".repeat(120);
    assert!(rename_folder(&mut lib, "C:\\Music", &long));
    assert_eq!(lib.folders[0].display_name.as_ref().map(String::len), Some(80));
    assert!(rename_folder(&mut lib, "C:\\Music", "   "));
    assert_eq!(lib.folders[0].display_name, None);
    assert!(!rename_folder(&mut lib, "C:\\Missing", "Name"));
}

#[test]
fn serve_art_returns_stored_covers_and_refuses_other_names() {
    let temp = tempfile::tempdir().expect("temp");
    fs::write(temp.path().join("0123456789abcdef.jpg"), b"jpeg-bytes").expect("write");
    let served = serve_art(temp.path(), "/0123456789abcdef.jpg");
    assert_eq!(served.status(), 200);
    assert_eq!(served.headers()["Content-Type"], "image/jpeg");
    assert_eq!(served.body().as_slice(), b"jpeg-bytes");
    assert_eq!(serve_art(temp.path(), "/0123456789abcdef.png").status(), 404);
    assert_eq!(serve_art(temp.path(), "/../secret.jpg").status(), 404);
    assert_eq!(serve_art(temp.path(), "/0123456789ABCDEF.jpg").status(), 404);
}

#[test]
fn save_art_names_by_format_and_ignores_oversized_data() {
    let temp = tempfile::tempdir().expect("temp");
    assert_eq!(
        save_art(temp.path(), "0123456789abcdef", b"png", true),
        Some("localart://0123456789abcdef.png".to_string())
    );
    assert_eq!(
        save_art(temp.path(), "0123456789abcdef", b"jpg", false),
        Some("localart://0123456789abcdef.jpg".to_string())
    );
    assert!(!temp.path().join("0123456789abcdef.png").exists());
    assert_eq!(save_art(temp.path(), "0123456789abcdef", &[], false), None);
    let big = vec![0u8; MAX_ART_BYTES + 1];
    assert_eq!(save_art(temp.path(), "0123456789abcdef", &big, false), None);
}

#[test]
fn prepend_opened_puts_fresh_tracks_first_and_caps_the_list() {
    let track = |id: &str| LocalTrack {
        id: id.to_string(),
        path: id.to_string(),
        title: id.to_string(),
        artist: String::new(),
        album: String::new(),
        genre: None,
        duration: 0.0,
        size: 0,
        mtime: 0,
        art: None,
        codec: None,
        ..LocalTrack::default()
    };
    let opened: Vec<LocalTrack> = (0..MAX_OPENED).map(|index| track(&format!("old{index}"))).collect();
    let next = prepend_opened(&opened, &[track("new"), track("old3")]);
    assert_eq!(next.len(), MAX_OPENED);
    assert_eq!(next[0].id, "new");
    assert_eq!(next[1].id, "old3");
    assert_eq!(next.iter().filter(|item| item.id == "old3").count(), 1);
}

#[test]
fn open_files_accepts_short_files_and_reports_folders_and_formats() {
    let temp = tempfile::tempdir().expect("temp");
    let short = temp.path().join("Quick.wav");
    write_wav(&short, 3);
    fs::write(temp.path().join("Old.wma"), b"x").expect("write");
    fs::write(temp.path().join("notes.txt"), b"x").expect("write");
    let paths = vec![
        short.to_string_lossy().into_owned(),
        temp.path().join("Old.wma").to_string_lossy().into_owned(),
        temp.path().join("notes.txt").to_string_lossy().into_owned(),
        temp.path().to_string_lossy().into_owned(),
    ];
    let result = open_paths(&paths, &temp.path().join(ART_DIR));
    assert_eq!(result.tracks.len(), 1);
    assert_eq!(result.tracks[0].title, "Quick");
    assert_eq!(result.unplayable, vec!["WMA".to_string()]);
    assert_eq!(result.folders.len(), 1);
}

#[tokio::test]
async fn library_survives_a_restart_with_folders_and_tracks() {
    let root = tempfile::tempdir().expect("temp");
    let music = root.path().join("Music");
    write_wav(&music.join("Keeper.wav"), 40);
    {
        let service = Service::load(root.path().to_path_buf()).await;
        service
            .add_folders(vec![music.to_string_lossy().into_owned()])
            .await
            .expect("add");
        let approvals = approvals_for(root.path(), &[music.clone()]).await;
        let lib = service.scan(true, &approvals).await.expect("scan");
        assert_eq!(lib.tracks.len(), 1);
    }
    let reloaded = Service::load(root.path().to_path_buf()).await;
    let lib = reloaded.library().await;
    assert_eq!(lib.folders.len(), 1);
    assert_eq!(names(&lib.tracks), vec!["Keeper".to_string()]);
    let statuses = reloaded.folder_statuses().await;
    assert!(statuses[0].exists);
}

#[tokio::test]
async fn scan_refuses_library_folders_that_are_not_approved() {
    let base = tempfile::tempdir().expect("temp");
    let approved = base.path().join("Music").join("Approved");
    let unapproved = base.path().join("Music").join("Unapproved");
    write_wav(&approved.join("Yes.wav"), 40);
    write_wav(&unapproved.join("No.wav"), 40);
    let service = Service::load(base.path().join("data")).await;
    service
        .add_folders(vec![
            approved.to_string_lossy().into_owned(),
            unapproved.to_string_lossy().into_owned(),
        ])
        .await
        .expect("add");
    let approvals = approvals_for(base.path(), std::slice::from_ref(&approved)).await;
    let lib = service.scan(true, &approvals).await.expect("scan");
    assert_eq!(names(&lib.tracks), vec!["Yes".to_string()]);
}

#[tokio::test]
async fn startup_reapproves_the_stored_library_folders() {
    let base = tempfile::tempdir().expect("temp");
    let data = base.path().join("data");
    let music = base.path().join("Music").join("Album");
    fs::create_dir_all(&music).expect("dirs");
    let service = Service::load(data.clone()).await;
    service
        .add_folders(vec![music.to_string_lossy().into_owned()])
        .await
        .expect("add");
    drop(service);

    let track = music.join("Track.wav");
    let before = Folders::open(&data, base.path().join("Downloads"), None).await;
    assert!(before.check(&track).is_err());

    let after = Folders::open(&data, base.path().join("Downloads"), None).await;
    after.approve_library(stored_folder_paths(&data).await);
    assert!(after.check(&track).is_ok());
}

#[tokio::test]
async fn opened_files_persist_forget_and_resolve_paths() {
    let root = tempfile::tempdir().expect("temp");
    let file = root.path().join("Opened.wav");
    write_wav(&file, 2);
    let service = Service::load(root.path().to_path_buf()).await;
    let result = service
        .open_files(vec![file.to_string_lossy().into_owned()])
        .await
        .expect("open");
    let id = result.tracks[0].id.clone();
    assert_eq!(service.track_path(&id).await, Some(result.tracks[0].path.clone()));

    let reloaded = Service::load(root.path().to_path_buf()).await;
    assert_eq!(reloaded.opened().await.len(), 1);
    assert!(reloaded.forget_opened(&id).await.expect("forget").is_empty());
    assert_eq!(service.track_path("local:missing").await, None);
}

#[tokio::test]
async fn remove_and_rename_persist_across_restart() {
    let root = tempfile::tempdir().expect("temp");
    let music = root.path().join("Music");
    fs::create_dir_all(&music).expect("dirs");
    write_wav(&music.join("Track.wav"), 40);
    let key = music.to_string_lossy().into_owned();
    let service = Service::load(root.path().to_path_buf()).await;
    service.add_folders(vec![key.clone()]).await.expect("add");
    let approvals = approvals_for(root.path(), &[music.clone()]).await;
    service.scan(true, &approvals).await.expect("scan");
    service.rename_folder(&key, "Mine").await.expect("rename");
    let lib = service.remove_folder(&key).await.expect("remove");
    assert!(lib.folders.is_empty());
    assert!(lib.tracks.is_empty());
    let reloaded = Service::load(root.path().to_path_buf()).await;
    assert!(reloaded.library().await.folders.is_empty());
}

fn be32(value: usize) -> [u8; 4] {
    u32::try_from(value).expect("u32").to_be_bytes()
}

fn le32(value: usize) -> [u8; 4] {
    u32::try_from(value).expect("u32").to_le_bytes()
}

fn mp4_box(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    [&be32(8 + body.len())[..], &kind[..], body].concat()
}

fn mp4_full(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    mp4_box(kind, &[&[0u8; 4][..], body].concat())
}

fn mp4_item(kind: &[u8; 4], text: &str) -> Vec<u8> {
    let data = [&1u32.to_be_bytes()[..], &[0u8; 4], text.as_bytes()].concat();
    mp4_box(kind, &mp4_box(b"data", &data))
}

fn m4a_bytes(title: &str, artist: &str, album: &str, codec: &[u8; 4]) -> Vec<u8> {
    let ftyp = mp4_box(b"ftyp", &[&b"M4A "[..], &[0u8; 4], b"M4A mp42isom"].concat());
    let mvhd = mp4_full(
        b"mvhd",
        &[
            &[0u8; 8][..],
            &1000u32.to_be_bytes(),
            &31_000u32.to_be_bytes(),
            &0x0001_0000u32.to_be_bytes(),
            &[1, 0],
            &[0u8; 10],
            &[0u8; 36],
            &[0u8; 24],
            &2u32.to_be_bytes(),
        ]
        .concat(),
    );
    let mdhd = mp4_full(
        b"mdhd",
        &[&[0u8; 8][..], &44_100u32.to_be_bytes(), &1_367_100u32.to_be_bytes(), &[0x55, 0xC4, 0, 0]].concat(),
    );
    let hdlr = mp4_full(b"hdlr", &[&[0u8; 4][..], b"soun", &[0u8; 12], &[0u8]].concat());
    let mut entry_body = [
        &[0u8; 6][..],
        &[0, 1],
        &[0u8; 8],
        &[0, 2, 0, 16, 0, 0, 0, 0],
        &(44_100u32 << 16).to_be_bytes(),
    ]
    .concat();
    if codec == b"alac" {
        entry_body.extend(mp4_box(b"alac", &[0u8; 28]));
    }
    let sample_entry = mp4_box(codec, &entry_body);
    let stsd = mp4_full(b"stsd", &[&1u32.to_be_bytes()[..], &sample_entry].concat());
    let stbl = mp4_box(b"stbl", &stsd);
    let mdia = mp4_box(b"mdia", &[mdhd, hdlr, mp4_box(b"minf", &stbl)].concat());
    let trak = mp4_box(b"trak", &mdia);
    let meta_hdlr = mp4_full(b"hdlr", &[&[0u8; 4][..], b"mdir", b"appl", &[0u8; 8], &[0u8]].concat());
    let ilst = mp4_box(
        b"ilst",
        &[
            mp4_item(b"\xa9nam", title),
            mp4_item(b"\xa9ART", artist),
            mp4_item(b"\xa9alb", album),
        ]
        .concat(),
    );
    let udta = mp4_box(b"udta", &mp4_full(b"meta", &[meta_hdlr, ilst].concat()));
    let moov = mp4_box(b"moov", &[mvhd, trak, udta].concat());
    [ftyp, moov, mp4_box(b"mdat", &[0u8; 64])].concat()
}

fn id3_frame(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    [&kind[..], &be32(body.len()), &[0u8; 2], body].concat()
}

fn id3_text(kind: &[u8; 4], text: &str) -> Vec<u8> {
    id3_frame(kind, &[&[0u8][..], text.as_bytes()].concat())
}

const MP3_FRAME: [u8; 4] = [0xFF, 0xFB, 0x90, 0x00];
const MP3_FRAMES: usize = 1200;

fn mp3_bytes(title: &str, artist: &str, album: &str, cover: Option<&[u8]>) -> Vec<u8> {
    let mut frames = [
        id3_text(b"TIT2", title),
        id3_text(b"TPE1", artist),
        id3_text(b"TALB", album),
    ]
    .concat();
    if let Some(data) = cover {
        let body = [&[0u8][..], b"image/jpeg\0", &[3, 0], data].concat();
        frames.extend(id3_frame(b"APIC", &body));
    }
    let size = frames.len();
    let syncsafe = [
        ((size >> 21) & 0x7f) as u8,
        ((size >> 14) & 0x7f) as u8,
        ((size >> 7) & 0x7f) as u8,
        (size & 0x7f) as u8,
    ];
    let mut bytes = [&b"ID3"[..], &[3, 0, 0], &syncsafe, &frames].concat();
    for _ in 0..MP3_FRAMES {
        bytes.extend_from_slice(&MP3_FRAME);
        bytes.extend(vec![0u8; 413]);
    }
    bytes
}

fn flac_block(kind: u8, body: &[u8]) -> Vec<u8> {
    [&[kind][..], &be32(body.len())[1..], body].concat()
}

fn vorbis_comments(comments: &[String]) -> Vec<u8> {
    let vendor = b"hushio-test";
    let mut out = le32(vendor.len()).to_vec();
    out.extend_from_slice(vendor);
    out.extend_from_slice(&le32(comments.len()));
    for comment in comments {
        out.extend_from_slice(&le32(comment.len()));
        out.extend_from_slice(comment.as_bytes());
    }
    out
}

fn tag_lines(title: &str, artist: &str, album: &str) -> Vec<String> {
    vec![format!("TITLE={title}"), format!("ARTIST={artist}"), format!("ALBUM={album}")]
}

fn flac_bytes(title: &str, artist: &str, album: &str) -> Vec<u8> {
    let packed: u64 = (44_100u64 << 44) | (1u64 << 41) | (15u64 << 36) | 1_367_100;
    let mut streaminfo = Vec::new();
    streaminfo.extend_from_slice(&4096u16.to_be_bytes());
    streaminfo.extend_from_slice(&4096u16.to_be_bytes());
    streaminfo.extend_from_slice(&[0u8; 6]);
    streaminfo.extend_from_slice(&packed.to_be_bytes());
    streaminfo.extend_from_slice(&[0u8; 16]);
    let comments = vorbis_comments(&tag_lines(title, artist, album));
    [&b"fLaC"[..], &flac_block(0x00, &streaminfo), &flac_block(0x84, &comments)].concat()
}

fn ogg_page(flags: u8, sequence: u32, granule: u64, packet: &[u8]) -> Vec<u8> {
    let mut lacing = vec![255u8; packet.len() / 255];
    lacing.push((packet.len() % 255) as u8);
    let mut page = b"OggS".to_vec();
    page.extend_from_slice(&[0, flags]);
    page.extend_from_slice(&granule.to_le_bytes());
    page.extend_from_slice(&1u32.to_le_bytes());
    page.extend_from_slice(&sequence.to_le_bytes());
    page.extend_from_slice(&[0u8; 4]);
    page.push(u8::try_from(lacing.len()).expect("segments"));
    page.extend(lacing);
    page.extend_from_slice(packet);
    page
}

fn ogg_bytes(title: &str, artist: &str, album: &str) -> Vec<u8> {
    let mut identification = vec![1u8];
    identification.extend_from_slice(b"vorbis");
    identification.extend_from_slice(&0u32.to_le_bytes());
    identification.push(2);
    identification.extend_from_slice(&44_100u32.to_le_bytes());
    identification.extend_from_slice(&[0u8; 12]);
    identification.extend_from_slice(&[0xB8, 1]);
    let mut comment = vec![3u8];
    comment.extend_from_slice(b"vorbis");
    comment.extend_from_slice(&vorbis_comments(&tag_lines(title, artist, album)));
    comment.push(1);
    let mut setup = vec![5u8];
    setup.extend_from_slice(b"vorbis");
    setup.extend_from_slice(&[0u8; 16]);
    setup.push(1);
    [
        ogg_page(0x02, 0, 0, &identification),
        ogg_page(0x00, 1, 0, &comment),
        ogg_page(0x00, 2, 0, &setup),
        ogg_page(0x04, 3, 1_367_100, &[0u8; 8]),
    ]
    .concat()
}

fn write_bytes(path: &Path, bytes: &[u8]) {
    fs::create_dir_all(path.parent().expect("parent")).expect("dirs");
    fs::write(path, bytes).expect("write");
}

#[test]
fn each_playable_format_is_indexed_with_its_tags() {
    let temp = tempfile::tempdir().expect("temp");
    let root = temp.path();
    write_bytes(&root.join("track 1.mp3"), &mp3_bytes("Mp3 Song", "Mp3 Artist", "Mp3 Album", None));
    write_bytes(&root.join("track 2.flac"), &flac_bytes("Flac Song", "Flac Artist", "Flac Album"));
    write_bytes(&root.join("track 3.m4a"), &m4a_bytes("M4a Song", "M4a Artist", "M4a Album", b"mp4a"));
    write_bytes(&root.join("track 4.ogg"), &ogg_bytes("Ogg Song", "Ogg Artist", "Ogg Album"));

    let (mut tracks, unplayable) = scan_root(root, true);
    tracks.sort_by(|a, b| a.title.cmp(&b.title));

    assert!(unplayable.is_empty());
    let found: Vec<(&str, &str, &str, f64)> = tracks
        .iter()
        .map(|track| (track.title.as_str(), track.artist.as_str(), track.album.as_str(), track.duration))
        .collect();
    assert_eq!(
        found,
        vec![
            ("Flac Song", "Flac Artist", "Flac Album", 31.0),
            ("M4a Song", "M4a Artist", "M4a Album", 31.0),
            ("Mp3 Song", "Mp3 Artist", "Mp3 Album", 31.0),
            ("Ogg Song", "Ogg Artist", "Ogg Album", 31.0),
        ]
    );
    assert!(tracks.iter().all(|track| track.codec.is_some()));
}

#[test]
fn embedded_cover_is_saved_under_the_track_hash() {
    let temp = tempfile::tempdir().expect("temp");
    let file = temp.path().join("Cover.mp3");
    let cover = b"\xff\xd8\xff\xe0cover-bytes";
    write_bytes(&file, &mp3_bytes("Cover", "Band", "Art", Some(cover)));
    let art_dir = temp.path().join(ART_DIR);

    let track = read_track(&file, 1, 1, &art_dir);

    let name = format!("{}.jpg", hash_path(&track.path));
    assert_eq!(track.art, Some(format!("localart://{name}")));
    assert_eq!(fs::read(art_dir.join(&name)).expect("cover saved"), cover);
}

#[test]
fn long_tag_values_are_cut_to_200_characters() {
    let temp = tempfile::tempdir().expect("temp");
    let file = temp.path().join("Long.mp3");
    write_bytes(&file, &mp3_bytes(&"x".repeat(300), "Band", "Album", None));

    let track = read_track(&file, 1, 1, &temp.path().join(ART_DIR));

    assert_eq!(track.title.chars().count(), MAX_TAG_CHARS);
}

#[test]
fn unreadable_audio_keeps_the_name_based_record() {
    let temp = tempfile::tempdir().expect("temp");
    let file = temp.path().join("Band - Broken.mp3");
    write_bytes(&file, b"not audio");

    let track = read_track(&file, 9, 5, &temp.path().join(ART_DIR));

    assert_eq!(track.title, "Broken");
    assert_eq!(track.artist, "Band");
    assert_eq!(track.album, UNKNOWN_ALBUM);
    assert_eq!(track.duration, 0.0);
    assert_eq!(track.codec, None);
    assert_eq!(track.art, None);
    assert_eq!(track.mtime, 5);
}

#[test]
fn thirty_seconds_is_kept_and_twenty_nine_is_dropped() {
    let temp = tempfile::tempdir().expect("temp");
    write_wav(&temp.path().join("Thirty.wav"), 30);
    write_wav(&temp.path().join("Twenty Nine.wav"), 29);

    let (tracks, _) = scan_root(temp.path(), true);

    assert_eq!(names(&tracks), vec!["Thirty".to_string()]);
}

#[test]
fn alac_inside_m4a_is_counted_as_unplayable() {
    let temp = tempfile::tempdir().expect("temp");
    write_bytes(&temp.path().join("lossless.m4a"), &m4a_bytes("Lossless", "Band", "Album", b"alac"));

    let (tracks, unplayable) = scan_root(temp.path(), true);

    assert!(tracks.is_empty());
    assert_eq!(
        unplayable,
        vec![Unplayable {
            format: "ALAC".to_string(),
            count: 1
        }]
    );
}

#[test]
fn non_audio_files_are_neither_listed_nor_counted() {
    let temp = tempfile::tempdir().expect("temp");
    fs::write(temp.path().join("cover.jpg"), b"\xff\xd8").expect("write");
    fs::write(temp.path().join("notes.txt"), b"lyrics").expect("write");
    fs::write(temp.path().join("playlist.m3u8"), b"#EXTM3U").expect("write");

    let (tracks, unplayable) = scan_root(temp.path(), true);

    assert!(tracks.is_empty());
    assert!(unplayable.is_empty());
}

#[cfg(desktop)]
mod tag_edits {
    use super::*;
    use lofty::file::TaggedFileExt;
    use lofty::tag::Accessor;
    use std::io;

    fn song(dir: &Path, name: &str) -> std::path::PathBuf {
        let path = dir.join(name);
        write_bytes(&path, &mp3_bytes("Old Song", "Old Artist", "Old Album", None));
        path
    }

    fn read_back(path: &Path) -> LocalTrack {
        tags::read_back(path, &path.parent().expect("parent").join(ART_DIR)).expect("read back")
    }

    #[test]
    fn edited_fields_read_back_and_the_audio_is_unchanged() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "song.mp3");
        let before = fs::read(&path).expect("read");
        let edits = tags::TagEdits {
            title: Some("New Song".into()),
            artist: Some("New Artist".into()),
            album: Some("New Album".into()),
            album_artist: Some("Various".into()),
            genre: Some("Pop".into()),
            year: Some(tags::NumberEdit::Number(2001)),
            track_number: Some(tags::NumberEdit::Number(3)),
            disc_number: Some(tags::NumberEdit::Number(2)),
        };
        tags::write_tags(&path, &edits).expect("edit");
        let track = read_back(&path);
        assert_eq!(track.title, "New Song");
        assert_eq!(track.artist, "New Artist");
        assert_eq!(track.album, "New Album");
        assert_eq!(track.album_artist.as_deref(), Some("Various"));
        assert_eq!(track.genre.as_deref(), Some("Pop"));
        assert_eq!((track.year, track.track_number, track.disc_number), (Some(2001), Some(3), Some(2)));
        assert_eq!(track.tag_version, TAG_VERSION);
        let tagged = lofty::read_from_path(&path).expect("lofty read");
        assert_eq!(tagged.primary_tag().and_then(|tag| tag.title()).as_deref(), Some("New Song"));
        let after = fs::read(&path).expect("read");
        let audio = &before[before.len() - MP3_FRAMES * 417..];
        assert!(after.ends_with(audio));
        assert!(!temp.path().join(".song.mp3.hushio-tags.tmp").exists());
    }

    #[test]
    fn absent_fields_stay_unchanged() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "song.mp3");
        let edits = tags::TagEdits {
            title: Some("Only Title".into()),
            ..tags::TagEdits::default()
        };
        tags::write_tags(&path, &edits).expect("edit");
        let track = read_back(&path);
        assert_eq!(track.title, "Only Title");
        assert_eq!(track.artist, "Old Artist");
        assert_eq!(track.album, "Old Album");
    }

    #[test]
    fn empty_text_and_numbers_clear_the_field() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "song.mp3");
        let set = tags::TagEdits {
            genre: Some("Rock".into()),
            year: Some(tags::NumberEdit::Number(1999)),
            ..tags::TagEdits::default()
        };
        tags::write_tags(&path, &set).expect("set");
        let clear = tags::TagEdits {
            artist: Some("  ".into()),
            genre: Some(String::new()),
            year: Some(tags::NumberEdit::Text(String::new())),
            ..tags::TagEdits::default()
        };
        tags::write_tags(&path, &clear).expect("clear");
        let tagged = lofty::read_from_path(&path).expect("lofty read");
        let tag = tagged.primary_tag().expect("tag");
        assert_eq!(tag.artist(), None);
        assert_eq!(tag.genre(), None);
        assert_eq!(tag.year(), None);
        assert_eq!(read_back(&path).artist, UNKNOWN_ARTIST);
    }

    #[test]
    fn numbers_out_of_range_or_not_numbers_are_refused() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "song.mp3");
        let before = fs::read(&path).expect("read");
        let negative = tags::TagEdits {
            year: Some(tags::NumberEdit::Number(-4)),
            ..tags::TagEdits::default()
        };
        assert_eq!(tags::write_tags(&path, &negative), Err("Year must be a number up to 9999.".to_string()));
        let words = tags::TagEdits {
            track_number: Some(tags::NumberEdit::Text("third".into())),
            ..tags::TagEdits::default()
        };
        assert_eq!(tags::write_tags(&path, &words), Err("Track number must be a number.".to_string()));
        assert_eq!(fs::read(&path).expect("read"), before);
    }

    #[test]
    fn read_only_files_are_refused_and_left_alone() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "song.mp3");
        let before = fs::read(&path).expect("read");
        let mut perms = fs::metadata(&path).expect("meta").permissions();
        perms.set_readonly(true);
        fs::set_permissions(&path, perms).expect("readonly");
        let edits = tags::TagEdits {
            title: Some("Nope".into()),
            ..tags::TagEdits::default()
        };
        assert_eq!(tags::write_tags(&path, &edits), Err(tags::READ_ONLY.to_string()));
        assert_eq!(fs::read(&path).expect("read"), before);
        let mut perms = fs::metadata(&path).expect("meta").permissions();
        perms.set_readonly(false);
        fs::set_permissions(&path, perms).expect("writable");
    }

    #[test]
    fn unsupported_files_return_the_plain_error() {
        let temp = tempfile::tempdir().expect("temp");
        let path = temp.path().join("notes.txt");
        write_bytes(&path, b"hello there");
        let edits = tags::TagEdits {
            title: Some("Nope".into()),
            ..tags::TagEdits::default()
        };
        assert_eq!(tags::write_tags(&path, &edits), Err(tags::UNSUPPORTED.to_string()));
        assert_eq!(fs::read(&path).expect("read"), b"hello there");
    }

    #[test]
    fn a_failed_replace_keeps_the_original_and_removes_the_copy() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "song.mp3");
        let before = fs::read(&path).expect("read");
        let edits = tags::TagEdits {
            title: Some("Changed".into()),
            ..tags::TagEdits::default()
        };
        let result = tags::write_with(&path, &edits, |_, _| Err(io::Error::other("forced")));
        assert_eq!(result, Err("Could not replace the file. Your song was not changed.".to_string()));
        assert_eq!(fs::read(&path).expect("read"), before);
        assert_eq!(fs::read_dir(temp.path()).expect("dir").count(), 1);
    }

    #[test]
    fn records_from_an_older_tag_reader_are_read_again() {
        let temp = tempfile::tempdir().expect("temp");
        let path = song(temp.path(), "old.mp3");
        let edits = tags::TagEdits {
            year: Some(tags::NumberEdit::Number(1999)),
            ..tags::TagEdits::default()
        };
        tags::write_tags(&path, &edits).expect("edit");
        let mut stale = read_back(&path);
        stale.year = None;
        stale.tag_version = 0;
        let art = temp.path().join(ART_DIR);
        let (tracks, _) = scan(&[folder_entry(temp.path())], &[stale], false, &art);
        assert_eq!(tracks[0].year, Some(1999));
    }

    #[tokio::test]
    async fn files_outside_the_approved_folders_cannot_be_edited() {
        let temp = tempfile::tempdir().expect("temp");
        let outside = temp.path().join("Outside").join("far.mp3");
        write_bytes(&outside, &mp3_bytes("Far", "Artist", "Album", None));
        let service = Service::load(temp.path().join("data")).await;
        service.open_files(vec![outside.to_string_lossy().into_owned()]).await.expect("open");
        let id = format!("local:{}", hash_path(&outside.to_string_lossy()));
        let approvals = approvals_for(temp.path(), &[]).await;
        let edits = tags::TagEdits {
            title: Some("Nope".into()),
            ..tags::TagEdits::default()
        };
        let error = service.edit_tags(&id, edits, &approvals).await.expect_err("refused");
        assert!(error.contains("approved folder"));
        assert_eq!(read_back(&outside).title, "Far");
    }

    #[tokio::test]
    async fn edit_updates_the_library_record_and_survives_a_restart() {
        let root = tempfile::tempdir().expect("temp");
        let music = root.path().join("Music");
        let path = music.join("Keeper.mp3");
        write_bytes(&path, &mp3_bytes("Keeper", "Artist", "Album", None));
        {
            let service = Service::load(root.path().to_path_buf()).await;
            service
                .add_folders(vec![music.to_string_lossy().into_owned()])
                .await
                .expect("add");
            let approvals = approvals_for(root.path(), &[music.clone()]).await;
            let lib = service.scan(true, &approvals).await.expect("scan");
            let id = lib.tracks[0].id.clone();
            let edits = tags::TagEdits {
                title: Some("Renamed".into()),
                album: Some("New Album".into()),
                ..tags::TagEdits::default()
            };
            let edited = service.edit_tags(&id, edits, &approvals).await.expect("edit");
            assert_eq!(edited.id, id);
            assert_eq!(edited.title, "Renamed");
            assert_eq!(edited.size, fs::metadata(&path).expect("meta").len());
        }
        let reloaded = Service::load(root.path().to_path_buf()).await;
        let lib = reloaded.library().await;
        assert_eq!(lib.tracks.len(), 1);
        assert_eq!(lib.tracks[0].title, "Renamed");
        assert_eq!(lib.tracks[0].album, "New Album");
    }
}

mod cue_sheets {
    use super::*;

    const THREE: &str = "TRACK 01 AUDIO\nTITLE \"One\"\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nTITLE \"Two\"\nINDEX 01 00:20:00\nTRACK 03 AUDIO\nINDEX 01 00:40:00\n";

    fn album_cue(file: &str, tracks: &str) -> String {
        format!("TITLE \"Long Album\"\nPERFORMER \"Lena\"\nREM DATE 2012\nFILE \"{file}\" WAVE\n{tracks}")
    }

    fn album_folder() -> tempfile::TempDir {
        let temp = tempfile::tempdir().expect("temp");
        write_wav(&temp.path().join("Long Album.wav"), 60);
        fs::write(temp.path().join("Long Album.cue"), album_cue("long album.WAV", THREE)).expect("cue");
        temp
    }

    #[test]
    fn each_cue_track_is_listed_and_the_whole_file_is_not() {
        let temp = album_folder();
        let (tracks, _) = scan_root(temp.path(), true);
        assert_eq!(tracks.len(), 3);
        let titles: Vec<&str> = tracks.iter().map(|track| track.title.as_str()).collect();
        assert_eq!(titles, ["One", "Two", "Track 03"]);
        assert_eq!(tracks.iter().map(|track| track.cue_start).collect::<Vec<_>>(), [Some(0.0), Some(20.0), Some(40.0)]);
        assert_eq!(tracks.iter().map(|track| track.cue_end).collect::<Vec<_>>(), [Some(20.0), Some(40.0), Some(60.0)]);
        assert!(tracks.iter().all(|track| (track.duration - 20.0).abs() < 1e-6));
        assert!(tracks.iter().all(|track| track.album == "Long Album" && track.year == Some(2012)));
        assert!(tracks.iter().all(|track| track.album_artist.as_deref() == Some("Lena") && track.artist == "Lena"));
        assert_eq!(tracks.iter().map(|track| track.track_number).collect::<Vec<_>>(), [Some(1), Some(2), Some(3)]);
        assert!(tracks.iter().all(|track| track.path == temp.path().join("Long Album.wav").to_string_lossy()));
        let ids: HashSet<&str> = tracks.iter().map(|track| track.id.as_str()).collect();
        assert_eq!(ids.len(), 3);
        assert!(!ids.contains(format!("local:{}", hash_path(&tracks[0].path)).as_str()));
    }

    #[test]
    fn track_ids_stay_the_same_across_scans() {
        let temp = album_folder();
        let folders = [folder_entry(temp.path())];
        let art = temp.path().join(ART_DIR);
        let (first, _) = scan(&folders, &[], true, &art);
        let (second, _) = scan(&folders, &first, true, &art);
        let ids = |tracks: &[LocalTrack]| tracks.iter().map(|track| track.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&first), ids(&second));
        assert_eq!(second.len(), 3);
    }

    #[test]
    fn a_cue_naming_a_missing_file_leaves_the_plain_song() {
        let temp = tempfile::tempdir().expect("temp");
        write_wav(&temp.path().join("Solo.wav"), 40);
        fs::write(temp.path().join("Solo.cue"), album_cue("Missing.wav", THREE)).expect("cue");
        let (tracks, _) = scan_root(temp.path(), true);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Solo");
        assert_eq!(tracks[0].cue_start, None);
    }

    #[test]
    fn a_sheet_with_two_file_lines_leaves_the_plain_song() {
        let temp = tempfile::tempdir().expect("temp");
        write_wav(&temp.path().join("Solo.wav"), 40);
        let text = album_cue("Solo.wav", THREE).replace("TRACK 01", "FILE \"Other.wav\" WAVE\nTRACK 01");
        fs::write(temp.path().join("Solo.cue"), text).expect("cue");
        let (tracks, _) = scan_root(temp.path(), true);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].cue_start, None);
    }

    #[test]
    fn removing_the_cue_sheet_brings_back_the_plain_song() {
        let temp = album_folder();
        let folders = [folder_entry(temp.path())];
        let art = temp.path().join(ART_DIR);
        let (cued, _) = scan(&folders, &[], true, &art);
        assert_eq!(cued.len(), 3);
        fs::remove_file(temp.path().join("Long Album.cue")).expect("remove cue");
        let (plain, _) = scan(&folders, &cued, true, &art);
        assert_eq!(plain.len(), 1);
        assert_eq!(plain[0].cue_start, None);
        assert_eq!(plain[0].id, format!("local:{}", hash_path(&plain[0].path)));
    }

    #[test]
    fn libraries_saved_before_cue_support_load_with_no_clip() {
        let json = r#"{"id":"local:1","path":"a.flac","title":"A","artist":"x","album":"y","duration":40.0,"size":1,"mtime":1}"#;
        let track: LocalTrack = serde_json::from_str(json).expect("track");
        assert_eq!(track.cue_start, None);
        assert_eq!(track.cue_end, None);
        assert_eq!(track.tag_version, 0);
    }
}

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

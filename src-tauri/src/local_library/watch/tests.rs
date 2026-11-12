use std::collections::BTreeSet;
use std::path::Path;
use std::time::{Duration, Instant};

use notify::event::{AccessKind, CreateKind, DataChange, ModifyKind, RemoveKind};
use notify::EventKind;

use super::{is_change, is_relevant, owning_root, wanted_roots, Debouncer};
use crate::local_library::LocalFolderEntry;

fn modify() -> EventKind {
    EventKind::Modify(ModifyKind::Data(DataChange::Any))
}

#[test]
fn audio_changes_are_relevant() {
    let root = Path::new("/music");
    assert!(is_relevant(root, Path::new("/music/Artist/song.mp3"), &EventKind::Create(CreateKind::File)));
    assert!(is_relevant(root, Path::new("/music/a.FLAC"), &modify()));
    assert!(is_relevant(root, Path::new("/music/old.wma"), &EventKind::Remove(RemoveKind::File)));
}

#[test]
fn other_files_are_not_relevant() {
    let root = Path::new("/music");
    assert!(!is_relevant(root, Path::new("/music/cover.jpg"), &modify()));
    assert!(!is_relevant(root, Path::new("/music/notes.txt"), &EventKind::Create(CreateKind::File)));
    assert!(!is_relevant(root, Path::new("/music/Album/cover.png"), &EventKind::Create(CreateKind::File)));
}

#[test]
fn temporary_and_hidden_files_are_ignored() {
    let root = Path::new("/music");
    for path in [
        "/music/song.mp3.part",
        "/music/~song.mp3",
        "/music/song.mp3~",
        "/music/song.tmp",
        "/music/song.mp3.crdownload",
        "/music/.hidden/song.mp3",
        "/music/.song.mp3",
    ] {
        assert!(!is_relevant(root, Path::new(path), &modify()), "{path}");
    }
}

#[test]
fn new_folders_count_but_removed_ones_do_not() {
    let root = Path::new("/music");
    assert!(is_relevant(root, Path::new("/music/New Album"), &EventKind::Create(CreateKind::Folder)));
    assert!(!is_relevant(root, Path::new("/music/New Album"), &EventKind::Remove(RemoveKind::Folder)));
    assert!(!is_relevant(root, Path::new("/music"), &EventKind::Create(CreateKind::Folder)));
}

#[test]
fn access_events_are_not_changes() {
    assert!(!is_change(&EventKind::Access(AccessKind::Read)));
    assert!(is_change(&modify()));
    assert!(is_change(&EventKind::Remove(RemoveKind::File)));
}

#[test]
fn a_burst_in_one_folder_fires_once_after_it_goes_quiet() {
    let start = Instant::now();
    let mut debouncer = Debouncer::new(Duration::from_secs(2));
    debouncer.touch("/a", start);
    debouncer.touch("/a", start + Duration::from_millis(900));
    debouncer.touch("/a", start + Duration::from_millis(1500));
    assert!(debouncer.take_due(start + Duration::from_millis(3000)).is_empty());
    assert_eq!(debouncer.take_due(start + Duration::from_millis(3500)), vec!["/a".to_string()]);
    assert!(debouncer.take_due(start + Duration::from_secs(10)).is_empty());
}

#[test]
fn folders_debounce_independently() {
    let start = Instant::now();
    let mut debouncer = Debouncer::new(Duration::from_secs(2));
    debouncer.touch("/a", start);
    debouncer.touch("/b", start + Duration::from_secs(1));
    assert_eq!(debouncer.take_due(start + Duration::from_secs(2)), vec!["/a".to_string()]);
    assert_eq!(debouncer.take_due(start + Duration::from_secs(3)), vec!["/b".to_string()]);
}

#[test]
fn nested_folder_events_belong_to_the_deepest_root() {
    let roots: BTreeSet<String> = ["/music".to_string(), "/music/Live".to_string(), "/other".to_string()].into();
    assert_eq!(owning_root(&roots, Path::new("/music/Live/a.mp3")), Some("/music/Live"));
    assert_eq!(owning_root(&roots, Path::new("/music/b.mp3")), Some("/music"));
    assert_eq!(owning_root(&roots, Path::new("/musicians/c.mp3")), None);
}

#[test]
fn only_existing_approved_local_folders_are_watched() {
    let dir = tempfile::tempdir().unwrap();
    let present = dir.path().join("present");
    let blocked = dir.path().join("blocked");
    std::fs::create_dir(&present).unwrap();
    std::fs::create_dir(&blocked).unwrap();
    let entry = |path: &Path| LocalFolderEntry {
        path: path.to_string_lossy().into_owned(),
        name: String::new(),
        display_name: None,
        added_at: 0,
    };
    let folders = vec![
        entry(&present),
        entry(&dir.path().join("missing")),
        entry(&blocked),
        LocalFolderEntry {
            path: "content://com.android.externalstorage.documents/tree/primary".to_string(),
            name: String::new(),
            display_name: None,
            added_at: 0,
        },
    ];
    let blocked_text = blocked.to_string_lossy().into_owned();
    let wanted = wanted_roots(&folders, |path| path.to_string_lossy() != blocked_text);
    assert_eq!(wanted, BTreeSet::from([present.to_string_lossy().into_owned()]));
}

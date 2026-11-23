use super::*;

const SHEET: &str = "REM GENRE \"Ambient\"\r\nREM DATE 2011\r\nPERFORMER \"Lena Holt\"\r\nTITLE \"Quiet Rooms\"\r\nFILE \"Quiet Rooms.flac\" WAVE\r\n  TRACK 01 AUDIO\r\n    TITLE \"Opening\"\r\n    PERFORMER \"Lena Holt & Sam\"\r\n    INDEX 01 00:00:00\r\n  TRACK 02 AUDIO\r\n    TITLE \"Second Room\"\r\n    INDEX 00 03:10:00\r\n    INDEX 01 03:12:00\r\n";

#[test]
fn utf8_sheet_gives_album_fields_and_tracks() {
    let sheet = parse(SHEET).expect("sheet");
    assert_eq!(sheet.file, "Quiet Rooms.flac");
    assert_eq!(sheet.title.as_deref(), Some("Quiet Rooms"));
    assert_eq!(sheet.performer.as_deref(), Some("Lena Holt"));
    assert_eq!(sheet.genre.as_deref(), Some("Ambient"));
    assert_eq!(sheet.date.as_deref(), Some("2011"));
    assert_eq!(sheet.tracks.len(), 2);
    assert_eq!(sheet.tracks[0].title.as_deref(), Some("Opening"));
    assert_eq!(sheet.tracks[0].performer.as_deref(), Some("Lena Holt & Sam"));
    assert_eq!(sheet.tracks[1].number, 2);
    assert_eq!(sheet.tracks[1].performer, None);
}

#[test]
fn index_frames_convert_to_seconds_at_75_per_second() {
    let sheet = parse(SHEET).expect("sheet");
    assert_eq!(sheet.tracks[0].start, 0.0);
    assert!((sheet.tracks[1].start - 192.0).abs() < 1e-9);
    let text = "FILE \"a.flac\" WAVE\nTRACK 01 AUDIO\nINDEX 01 01:02:37\nTRACK 02 AUDIO\nINDEX 01 02:00:00\n";
    let sheet = parse(text).expect("sheet");
    assert!((sheet.tracks[0].start - (62.0 + 37.0 / 75.0)).abs() < 1e-9);
    assert!((sheet.tracks[1].start - 120.0).abs() < 1e-9);
}

#[test]
fn latin1_bytes_are_read_as_windows_1252() {
    let mut bytes = b"TITLE \"Caf".to_vec();
    bytes.push(0xE9);
    bytes.extend_from_slice(b" \x93Night\x94\"\nFILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n");
    let sheet = parse(&decode(&bytes)).expect("sheet");
    assert_eq!(sheet.title.as_deref(), Some("Caf\u{e9} \u{201c}Night\u{201d}"));
}

#[test]
fn utf8_text_is_kept_when_it_is_valid() {
    let text = "TITLE \"Ça va\"\nFILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    let sheet = parse(&decode(text.as_bytes())).expect("sheet");
    assert_eq!(sheet.title.as_deref(), Some("Ça va"));
}

#[test]
fn byte_order_mark_is_stripped_in_both_encodings() {
    let text = "FILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    let mut utf8 = vec![0xEF, 0xBB, 0xBF];
    utf8.extend_from_slice(text.as_bytes());
    assert_eq!(decode(&utf8), text);
    let mut latin = vec![0xEF, 0xBB, 0xBF, 0xE9];
    latin.extend_from_slice(text.as_bytes());
    assert!(decode(&latin).starts_with('\u{e9}'));
}

#[test]
fn missing_titles_leave_none_for_the_scanner_to_fill() {
    let text = "FILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    let sheet = parse(text).expect("sheet");
    assert_eq!(sheet.title, None);
    assert_eq!(sheet.performer, None);
    assert_eq!(sheet.genre, None);
    assert_eq!(sheet.date, None);
    assert_eq!(sheet.tracks[0].title, None);
}

#[test]
fn rem_fields_accept_quoted_and_bare_values() {
    let text = "REM DATE 1999\nREM GENRE Jazz\nFILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    let sheet = parse(text).expect("sheet");
    assert_eq!(sheet.genre.as_deref(), Some("Jazz"));
    assert_eq!(sheet.date.as_deref(), Some("1999"));
}

#[test]
fn several_file_lines_make_the_sheet_unusable() {
    let text = "FILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nFILE \"b.wav\" WAVE\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    assert_eq!(parse(text), None);
}

#[test]
fn a_sheet_with_one_track_is_unusable() {
    let text = "FILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\n";
    assert_eq!(parse(text), None);
}

#[test]
fn data_tracks_and_tracks_without_index_one_are_left_out() {
    let text = "FILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 00 00:30:00\nTRACK 03 AUDIO\nINDEX 01 01:00:00\nTRACK 04 DATA\nINDEX 01 02:00:00\n";
    let sheet = parse(text).expect("sheet");
    let numbers: Vec<u32> = sheet.tracks.iter().map(|track| track.number).collect();
    assert_eq!(numbers, vec![1, 3]);
}

#[test]
fn quoted_file_names_with_spaces_are_read_whole() {
    let text = "FILE \"My Live Set (2010).flac\" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    assert_eq!(parse(text).expect("sheet").file, "My Live Set (2010).flac");
}

#[test]
fn unquoted_file_names_drop_only_the_type_word() {
    let text = "FILE Live Set.flac WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    assert_eq!(parse(text).expect("sheet").file, "Live Set.flac");
}

#[test]
fn starts_must_increase() {
    let text = "FILE \"a.wav\" WAVE\nTRACK 01 AUDIO\nINDEX 01 02:00:00\nTRACK 02 AUDIO\nINDEX 01 01:00:00\n";
    assert_eq!(parse(text), None);
}

#[test]
fn cue_name_check_ignores_case() {
    assert!(is_cue_name("Album.CUE"));
    assert!(is_cue_name("album.cue"));
    assert!(!is_cue_name("album.cue.txt"));
    assert!(!is_cue_name("cue"));
}

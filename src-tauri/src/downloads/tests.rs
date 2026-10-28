use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use lofty::prelude::{Accessor, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::TagType;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio::time::{sleep, timeout};

use super::tags::{self, Cover, CoverFormat, Tags};
use super::{
    DownloadEvent, Downloads, EventKind, EventSink, Policy, Throttle, TrackInfo, claim_name,
    cover_url, is_webm, require_https, sanitize_filename, valid_id,
};

struct Channel(mpsc::UnboundedSender<DownloadEvent>);

impl EventSink for Channel {
    fn emit(&self, event: DownloadEvent) {
        self.0.send(event).expect("test receiver alive");
    }
}

type Events = mpsc::UnboundedReceiver<DownloadEvent>;

fn setup(stall: Duration) -> (Downloads<Channel>, Events) {
    let (tx, rx) = mpsc::unbounded_channel();
    let policy = Policy {
        stall,
        backoff: Duration::from_millis(10),
    };
    (
        Downloads::with_policy(Channel(tx), PathBuf::from("unused"), policy),
        rx,
    )
}

fn track(id: &str) -> TrackInfo {
    TrackInfo {
        id: id.to_owned(),
        title: "Title".to_owned(),
        artist: "Artist".to_owned(),
        album: Some("Album".to_owned()),
        thumb: None,
    }
}

async fn next(events: &mut Events) -> DownloadEvent {
    timeout(Duration::from_secs(10), events.recv())
        .await
        .expect("event in time")
        .expect("sink open")
}

async fn finished(events: &mut Events) -> DownloadEvent {
    loop {
        let event = next(events).await;
        if matches!(
            event.kind,
            EventKind::Done | EventKind::Failed | EventKind::Cancelled
        ) {
            return event;
        }
    }
}

async fn wait_for_kind(events: &mut Events, kind: EventKind) -> DownloadEvent {
    loop {
        let event = next(events).await;
        if event.kind == kind {
            return event;
        }
    }
}

async fn wait_for_file(path: &PathBuf) {
    timeout(Duration::from_secs(10), async {
        while !path.exists() {
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("file appears");
}

#[derive(Clone)]
struct Reply {
    status: u16,
    declared: usize,
    body: Vec<u8>,
    stall: bool,
}

impl Reply {
    fn ok(body: &[u8]) -> Self {
        Self {
            status: 200,
            declared: body.len(),
            body: body.to_vec(),
            stall: false,
        }
    }

    fn status(status: u16) -> Self {
        Self {
            status,
            declared: 0,
            body: Vec::new(),
            stall: false,
        }
    }

    fn silent_stall(declared: usize) -> Self {
        Self {
            status: 200,
            declared,
            body: Vec::new(),
            stall: true,
        }
    }
}

async fn serve<F>(handler: F) -> String
where
    F: Fn(usize, &str) -> Reply + Send + Sync + 'static,
{
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let address = listener.local_addr().expect("address");
    let handler = Arc::new(handler);
    tokio::spawn(async move {
        let mut index = 0;
        while let Ok((socket, _)) = listener.accept().await {
            tokio::spawn(answer(socket, index, Arc::clone(&handler)));
            index += 1;
        }
    });
    format!("http://{address}/audio.m4a")
}

async fn answer<F: Fn(usize, &str) -> Reply>(mut socket: TcpStream, index: usize, handler: Arc<F>) {
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        let Ok(byte) = socket.read_u8().await else {
            return;
        };
        head.push(byte);
    }
    let reply = handler(index, &String::from_utf8_lossy(&head));
    let line = format!(
        "HTTP/1.1 {} Test\r\nContent-Type: audio/mp4\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        reply.status, reply.declared
    );
    if socket.write_all(line.as_bytes()).await.is_err()
        || socket.write_all(&reply.body).await.is_err()
    {
        return;
    }
    if reply.stall {
        std::future::pending::<()>().await;
    }
}

fn range_from(head: &str) -> u64 {
    head.lines()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("range: bytes=")
                .map(|rest| {
                    rest.trim_end_matches('-')
                        .parse::<u64>()
                        .expect("numeric range")
                })
        })
        .unwrap_or(0)
}

fn content() -> Vec<u8> {
    (0u8..=99).collect()
}

#[tokio::test]
async fn completed_download_is_renamed_from_part_and_reports_done() {
    let body = b"audio bytes for the first test".to_vec();
    let served = body.clone();
    let url = serve(move |_, _| Reply::ok(&served)).await;
    let dir = tempfile::tempdir().expect("temp dir");
    let (downloads, mut events) = setup(Duration::from_secs(5));

    downloads
        .enqueue(track("abcdefghijk"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    let done = finished(&mut events).await;

    assert_eq!(done.kind, EventKind::Done);
    let path = PathBuf::from(done.path.expect("done carries the path"));
    assert_eq!(path, dir.path().join("Artist - Title.m4a"));
    assert_eq!(std::fs::read(&path).expect("final file"), body);
    assert!(!dir.path().join(".hushio-abcdefghijk.part").exists());
    assert!(downloads.queue().is_empty());
}

#[tokio::test]
async fn server_errors_are_retried_until_one_succeeds() {
    let body = b"recovered".to_vec();
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let url = serve(move |index, _| {
        counter.fetch_add(1, Ordering::SeqCst);
        if index < 2 {
            Reply::status(500)
        } else {
            Reply::ok(&body)
        }
    })
    .await;
    let dir = tempfile::tempdir().expect("temp dir");
    let (downloads, mut events) = setup(Duration::from_secs(5));

    downloads
        .enqueue(track("retrytrack01"), url, Some(dir.path().to_path_buf()))
        .expect("queued");

    assert_eq!(finished(&mut events).await.kind, EventKind::Done);
    assert_eq!(calls.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn four_failed_attempts_report_the_last_http_status() {
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let url = serve(move |_, _| {
        counter.fetch_add(1, Ordering::SeqCst);
        Reply::status(503)
    })
    .await;
    let dir = tempfile::tempdir().expect("temp dir");
    let (downloads, mut events) = setup(Duration::from_secs(5));

    downloads
        .enqueue(track("alwaysdown01"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    let failed = finished(&mut events).await;

    assert_eq!(failed.kind, EventKind::Failed);
    assert_eq!(failed.reason.as_deref(), Some("HTTP 503"));
    assert_eq!(calls.load(Ordering::SeqCst), 4);
    assert!(!dir.path().join(".hushio-alwaysdown01.part").exists());
}

#[tokio::test]
async fn stalled_attempt_resumes_from_the_bytes_already_on_disk() {
    let full = content();
    let first = full[..10].to_vec();
    let rest = full[10..].to_vec();
    let url = serve(move |index, head| {
        if index == 0 {
            Reply {
                status: 200,
                declared: 100,
                body: first.clone(),
                stall: true,
            }
        } else if range_from(head) == 10 {
            Reply {
                status: 206,
                declared: rest.len(),
                body: rest.clone(),
                stall: false,
            }
        } else {
            Reply::status(500)
        }
    })
    .await;
    let dir = tempfile::tempdir().expect("temp dir");
    let (downloads, mut events) = setup(Duration::from_millis(200));

    downloads
        .enqueue(track("stalltrack01"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    let done = finished(&mut events).await;

    assert_eq!(done.kind, EventKind::Done);
    let path = PathBuf::from(done.path.expect("path"));
    assert_eq!(std::fs::read(path).expect("final file"), full);
}

#[tokio::test]
async fn short_body_is_resumed_on_the_next_attempt() {
    let full = content();
    let first = full[..40].to_vec();
    let rest = full[40..].to_vec();
    let url = serve(move |index, head| {
        if index == 0 {
            Reply {
                status: 200,
                declared: 100,
                body: first.clone(),
                stall: false,
            }
        } else if range_from(head) == 40 {
            Reply {
                status: 206,
                declared: rest.len(),
                body: rest.clone(),
                stall: false,
            }
        } else {
            Reply::status(500)
        }
    })
    .await;
    let dir = tempfile::tempdir().expect("temp dir");
    let (downloads, mut events) = setup(Duration::from_secs(5));

    downloads
        .enqueue(track("shorttrack01"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    let done = finished(&mut events).await;

    assert_eq!(done.kind, EventKind::Done);
    let path = PathBuf::from(done.path.expect("path"));
    assert_eq!(std::fs::read(path).expect("final file"), full);
}

#[tokio::test]
async fn every_attempt_stalling_reports_the_stall() {
    let calls = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&calls);
    let url = serve(move |_, _| {
        counter.fetch_add(1, Ordering::SeqCst);
        Reply::silent_stall(100)
    })
    .await;
    let dir = tempfile::tempdir().expect("temp dir");
    let (downloads, mut events) = setup(Duration::from_millis(100));

    downloads
        .enqueue(track("stuckstream1"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    let failed = finished(&mut events).await;

    assert_eq!(failed.kind, EventKind::Failed);
    assert_eq!(failed.reason.as_deref(), Some("download stalled"));
    assert_eq!(calls.load(Ordering::SeqCst), 4);
    assert!(!dir.path().join(".hushio-stuckstream1.part").exists());
}

#[tokio::test]
async fn cancel_removes_the_partial_and_reports_cancelled() {
    let url = serve(|_, _| Reply::silent_stall(100)).await;
    let dir = tempfile::tempdir().expect("temp dir");
    let part = dir.path().join(".hushio-cancelme1234.part");
    let (downloads, mut events) = setup(Duration::from_secs(60));

    downloads
        .enqueue(track("cancelme1234"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    wait_for_file(&part).await;
    assert!(downloads.cancel("cancelme1234"));
    let cancelled = finished(&mut events).await;

    assert_eq!(cancelled.kind, EventKind::Cancelled);
    assert!(!part.exists());
    assert!(!dir.path().join("Artist - Title.m4a").exists());
    assert!(!downloads.cancel("cancelme1234"));
}

#[tokio::test]
async fn only_two_downloads_run_at_once() {
    let url = serve(|_, _| Reply::silent_stall(100)).await;
    let dir = tempfile::tempdir().expect("temp dir");
    let folder = Some(dir.path().to_path_buf());
    let (downloads, mut events) = setup(Duration::from_secs(60));

    for id in ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"] {
        downloads
            .enqueue(track(id), url.clone(), folder.clone())
            .expect("queued");
    }
    assert!(
        downloads
            .enqueue(track("aaaaaaaaaaa"), url.clone(), folder.clone())
            .is_err()
    );

    let mut started = Vec::new();
    while started.len() < 2 {
        let event = next(&mut events).await;
        if event.kind == EventKind::Start {
            started.push(event.id);
        }
    }
    let running = downloads.queue().iter().filter(|row| row.running).count();
    assert_eq!(running, 2);

    let early = timeout(
        Duration::from_millis(300),
        wait_for_kind(&mut events, EventKind::Start),
    )
    .await;
    assert!(
        early.is_err(),
        "a third download started while two were running"
    );

    assert!(downloads.cancel(&started[0]));
    let mut cancelled_first = false;
    let next_start = loop {
        let event = next(&mut events).await;
        if event.kind == EventKind::Cancelled && event.id == started[0] {
            cancelled_first = true;
        }
        if event.kind == EventKind::Start && event.id != started[1] {
            break event;
        }
    };
    assert!(cancelled_first, "the slot opened only after the cancel");
    assert_eq!(next_start.id, "ccccccccccc");
    downloads.abandon();
}

#[tokio::test]
async fn abandon_removes_partials_without_cancel_events() {
    let url = serve(|_, _| Reply::silent_stall(100)).await;
    let dir = tempfile::tempdir().expect("temp dir");
    let part = dir.path().join(".hushio-abandonable1.part");
    let (downloads, mut events) = setup(Duration::from_secs(60));

    downloads
        .enqueue(track("abandonable1"), url, Some(dir.path().to_path_buf()))
        .expect("queued");
    wait_for_file(&part).await;
    downloads.abandon();

    let reported = timeout(Duration::from_millis(500), async {
        loop {
            let event = next(&mut events).await;
            if matches!(event.kind, EventKind::Cancelled | EventKind::Failed) {
                return event;
            }
        }
    })
    .await;
    assert!(reported.is_err(), "abandon must not report cancelled");
    assert!(!part.exists());
}

#[test]
fn colliding_names_get_a_number_before_the_extension() {
    let dir = tempfile::tempdir().expect("temp dir");
    let names: Vec<String> = (0..3)
        .map(|_| {
            claim_name(dir.path(), "Artist - Title", "m4a")
                .expect("claimed")
                .file_name()
                .expect("file name")
                .to_string_lossy()
                .into_owned()
        })
        .collect();

    assert_eq!(
        names,
        [
            "Artist - Title.m4a",
            "Artist - Title (2).m4a",
            "Artist - Title (3).m4a"
        ]
    );
}

#[test]
fn relative_folders_and_bad_ids_are_refused_before_queueing() {
    let (downloads, mut events) = setup(Duration::from_secs(5));

    assert!(
        downloads
            .enqueue(
                track("abcdefghijk"),
                "https://example.test/a".to_owned(),
                Some(PathBuf::from("relative")),
            )
            .is_err()
    );
    assert!(
        downloads
            .enqueue(
                track("../escape"),
                "https://example.test/a".to_owned(),
                None
            )
            .is_err()
    );
    assert!(events.try_recv().is_err());
}

#[test]
fn progress_is_emitted_at_most_once_per_quarter_second() {
    let start = Instant::now();
    let mut throttle = Throttle::default();
    let emitted: Vec<u64> = (0..100)
        .filter_map(|tick| {
            let at = start + Duration::from_millis(tick * 10);
            throttle.ready(at).then_some(tick * 10)
        })
        .collect();

    assert_eq!(emitted, vec![0, 260, 520, 780]);
}

#[test]
fn throttle_window_is_strictly_more_than_250_ms() {
    let start = Instant::now();
    let mut throttle = Throttle::default();

    assert!(throttle.ready(start));
    assert!(!throttle.ready(start + Duration::from_millis(250)));
    assert!(throttle.ready(start + Duration::from_millis(251)));
}

#[test]
fn filenames_replace_unsafe_characters_and_collapse_spaces() {
    assert_eq!(sanitize_filename("A/B:C  *D"), "A_B_C _D");
    assert_eq!(sanitize_filename("a\u{200b}b\u{feff}c"), "a_b_c");
    assert_eq!(sanitize_filename("   "), "track");
    assert_eq!(sanitize_filename(&"x".repeat(150)).chars().count(), 120);
}

#[test]
fn reserved_device_names_get_an_underscore_prefix() {
    assert_eq!(sanitize_filename("CON"), "_CON");
    assert_eq!(sanitize_filename("nul.m4a"), "_nul.m4a");
    assert_eq!(sanitize_filename("com1"), "_com1");
    assert_eq!(sanitize_filename("lpt9"), "_lpt9");
    assert_eq!(sanitize_filename("com0"), "com0");
    assert_eq!(sanitize_filename("console"), "console");
}

#[test]
fn cover_urls_are_upgraded_to_a_1000_pixel_size() {
    assert_eq!(
        cover_url("https://lh3.googleusercontent.com/abc=w60-h60-c").as_deref(),
        Some("https://lh3.googleusercontent.com/abc=w1000-h1000-c")
    );
    assert_eq!(
        cover_url("https://lh3.googleusercontent.com/abc=w60-c-h60").as_deref(),
        Some("https://lh3.googleusercontent.com/abc=w1000-c-h1000")
    );
    assert_eq!(
        cover_url("  https://lh3.googleusercontent.com/abc=s60  ").as_deref(),
        Some("https://lh3.googleusercontent.com/abc=s1000")
    );
    assert_eq!(cover_url("http://example.test/a=s60"), None);
}

#[test]
fn covers_are_accepted_only_by_jpeg_or_png_magic() {
    let jpeg = Cover::sniff(vec![0xFF, 0xD8, 0xFF, 0xE0]).expect("jpeg");
    assert_eq!(jpeg.format, CoverFormat::Jpeg);
    let png = Cover::sniff(vec![0x89, 0x50, 0x4E, 0x47]).expect("png");
    assert_eq!(png.format, CoverFormat::Png);
    assert!(Cover::sniff(b"GIF89a".to_vec()).is_none());
    assert!(Cover::sniff(b"RIFF....WEBP".to_vec()).is_none());
}

#[test]
fn webm_and_opus_results_are_not_tagged() {
    assert!(is_webm("audio/webm; codecs=opus"));
    assert!(is_webm("audio/OPUS"));
    assert!(!is_webm("audio/mp4"));
}

#[test]
fn ids_and_stream_urls_are_checked() {
    assert!(valid_id("dQw4w9WgXcQ"));
    assert!(!valid_id(""));
    assert!(!valid_id("../x"));
    assert!(!valid_id(&"a".repeat(65)));
    assert!(require_https("https://rr1.example.test/videoplayback").is_ok());
    assert!(require_https("http://127.0.0.1/a").is_err());
}

fn atom(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    let size = u32::try_from(8 + body.len()).expect("atom size");
    let mut out = size.to_be_bytes().to_vec();
    out.extend_from_slice(kind);
    out.extend_from_slice(body);
    out
}

fn full_atom(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
    atom(kind, &[&[0u8; 4][..], body].concat())
}

fn moov_for(payload_offset: u32, extra: &[u8]) -> Vec<u8> {
    let mvhd = full_atom(
        b"mvhd",
        &[
            &0u32.to_be_bytes()[..],
            &0u32.to_be_bytes(),
            &1000u32.to_be_bytes(),
            &0u32.to_be_bytes(),
            &0x0001_0000u32.to_be_bytes(),
            &[1, 0],
            &[0u8; 10],
            &[0u8; 36],
            &[0u8; 24],
            &2u32.to_be_bytes(),
        ]
        .concat(),
    );
    let tkhd = full_atom(
        b"tkhd",
        &[
            &[0u8; 8][..],
            &1u32.to_be_bytes(),
            &[0u8; 4 + 8 + 2 + 2 + 2 + 2 + 36 + 8],
        ]
        .concat(),
    );
    let mdhd = full_atom(
        b"mdhd",
        &[
            &[0u8; 8][..],
            &44_100u32.to_be_bytes(),
            &0u32.to_be_bytes(),
            &[0x55, 0xC4, 0, 0],
        ]
        .concat(),
    );
    let hdlr = full_atom(
        b"hdlr",
        &[&0u32.to_be_bytes()[..], b"soun", &[0u8; 12], &[0u8]].concat(),
    );
    let smhd = full_atom(b"smhd", &[0u8; 4]);
    let dref = full_atom(
        b"dref",
        &[&1u32.to_be_bytes()[..], &full_atom(b"url ", &[])].concat(),
    );
    let dinf = atom(b"dinf", &dref);
    let mp4a = atom(
        b"mp4a",
        &[
            &[0u8; 6][..],
            &[0, 1],
            &[0u8; 8],
            &[0, 2, 0, 16, 0, 0, 0, 0],
            &(44_100u32 << 16).to_be_bytes(),
        ]
        .concat(),
    );
    let stsd = full_atom(b"stsd", &[&1u32.to_be_bytes()[..], &mp4a].concat());
    let stts = full_atom(b"stts", &0u32.to_be_bytes());
    let stsc = full_atom(b"stsc", &0u32.to_be_bytes());
    let stsz = full_atom(
        b"stsz",
        &[&0u32.to_be_bytes()[..], &0u32.to_be_bytes()].concat(),
    );
    let stco = full_atom(
        b"stco",
        &[&1u32.to_be_bytes()[..], &payload_offset.to_be_bytes()].concat(),
    );
    let stbl = atom(b"stbl", &[stsd, stts, stsc, stsz, stco].concat());
    let minf = atom(b"minf", &[smhd, dinf, stbl].concat());
    let mdia = atom(b"mdia", &[mdhd, hdlr, minf].concat());
    let trak = atom(b"trak", &[tkhd, mdia].concat());
    atom(b"moov", &[mvhd, trak, extra.to_vec()].concat())
}

fn m4a_fixture(payload: &[u8]) -> Vec<u8> {
    m4a_fixture_with(payload, &[])
}

fn m4a_fixture_with(payload: &[u8], extra: &[u8]) -> Vec<u8> {
    let ftyp = atom(
        b"ftyp",
        &[&b"M4A "[..], &0u32.to_be_bytes(), b"M4A mp42isom"].concat(),
    );
    let probe = moov_for(0, extra);
    let offset = ftyp.len() + probe.len() + 8;
    let moov = moov_for(u32::try_from(offset).expect("offset fits"), extra);
    [ftyp, moov, atom(b"mdat", payload)].concat()
}

fn text_item(kind: &[u8; 4], text: &str) -> Vec<u8> {
    atom(
        kind,
        &atom(
            b"data",
            &[&1u32.to_be_bytes()[..], &[0u8; 4], text.as_bytes()].concat(),
        ),
    )
}

fn contains(bytes: &[u8], needle: &[u8]) -> bool {
    bytes.windows(needle.len()).any(|window| window == needle)
}

#[test]
fn existing_metadata_keeps_foreign_items_and_replaces_owned_ones() {
    let dir = tempfile::tempdir().expect("temp dir");
    let part = dir.path().join("existing.part");
    let payload = b"EXISTING-PAYLOAD-0123456789".repeat(3);
    let ilst = atom(
        b"ilst",
        &[
            text_item(b"\xa9nam", "OldTitle"),
            text_item(b"\xa9day", "2020"),
        ]
        .concat(),
    );
    let hdlr = full_atom(
        b"hdlr",
        &[&[0u8; 4][..], b"mdir", b"appl", &[0u8; 8], &[0u8]].concat(),
    );
    let udta = atom(b"udta", &full_atom(b"meta", &[hdlr, ilst].concat()));
    std::fs::write(&part, m4a_fixture_with(&payload, &udta)).expect("fixture");

    tags::write(
        &part,
        &Tags {
            title: "Song".to_owned(),
            artist: "Band".to_owned(),
            album: None,
            cover: None,
        },
    )
    .expect("tagged");

    let bytes = std::fs::read(&part).expect("tagged file");
    let payload_at = bytes
        .windows(payload.len())
        .position(|window| window == payload.as_slice())
        .expect("payload kept");
    assert_eq!(stco_value(&bytes) as usize, payload_at);
    assert!(contains(&bytes, b"Song"));
    assert!(!contains(&bytes, b"OldTitle"));
    assert!(contains(&bytes, b"2020"));
    let read_back = Probe::open(&part)
        .expect("opens")
        .guess_file_type()
        .expect("probed")
        .read()
        .expect("lofty reads the file");
    let tag = read_back.tag(TagType::Mp4Ilst).expect("iTunes tag");
    assert_eq!(tag.title().as_deref(), Some("Song"));
    assert_eq!(tag.artist().as_deref(), Some("Band"));
}

fn stco_value(bytes: &[u8]) -> u32 {
    let at = bytes
        .windows(4)
        .position(|window| window == b"stco")
        .expect("stco atom");
    u32::from_be_bytes(bytes[at + 12..at + 16].try_into().expect("four bytes"))
}

#[test]
fn tags_round_trip_and_stco_follows_the_moved_mdat() {
    let dir = tempfile::tempdir().expect("temp dir");
    let part = dir.path().join("track.part");
    let payload = b"PAYLOAD-BYTES-0123456789".repeat(4);
    std::fs::write(&part, m4a_fixture(&payload)).expect("fixture");
    let cover = Cover {
        format: CoverFormat::Jpeg,
        data: vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3],
    };

    tags::write(
        &part,
        &Tags {
            title: "Song".to_owned(),
            artist: "Band".to_owned(),
            album: Some("Record".to_owned()),
            cover: Some(cover.clone()),
        },
    )
    .expect("tagged");

    let bytes = std::fs::read(&part).expect("tagged file");
    let payload_at = bytes
        .windows(payload.len())
        .position(|window| window == payload.as_slice())
        .expect("payload kept");
    assert_eq!(stco_value(&bytes) as usize, payload_at);
    assert!(!dir.path().join("track.part.tagging").exists());

    let read_back = Probe::open(&part)
        .expect("opens")
        .guess_file_type()
        .expect("probed")
        .read()
        .expect("lofty reads the file");
    let tag = read_back.tag(TagType::Mp4Ilst).expect("iTunes tag");
    assert_eq!(tag.title().as_deref(), Some("Song"));
    assert_eq!(tag.artist().as_deref(), Some("Band"));
    assert_eq!(tag.album().as_deref(), Some("Record"));
    let pictures = tag.pictures();
    assert_eq!(pictures.len(), 1);
    assert_eq!(pictures[0].data(), cover.data.as_slice());
}

#[test]
fn unreadable_part_is_left_untouched() {
    let dir = tempfile::tempdir().expect("temp dir");
    let part = dir.path().join("broken.part");
    let garbage = b"not an mp4 at all".to_vec();
    std::fs::write(&part, &garbage).expect("write");

    let outcome = tags::write(
        &part,
        &Tags {
            title: "T".to_owned(),
            artist: "A".to_owned(),
            album: None,
            cover: None,
        },
    );

    assert!(outcome.is_err());
    assert_eq!(std::fs::read(&part).expect("still there"), garbage);
    assert!(!dir.path().join("broken.part.tagging").exists());
}

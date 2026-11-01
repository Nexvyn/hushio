use super::*;
use chrono::TimeZone;
use std::sync::Arc;

fn at(year: i32, month: u32, day: u32, hour: u32) -> DateTime<Local> {
    Local.with_ymd_and_hms(year, month, day, hour, 0, 0).single().expect("local time")
}

fn track(id: &str, duration: Option<f64>) -> TrackInput {
    TrackInput {
        id: id.into(),
        title: format!("Title {id}"),
        artist: "Artist".into(),
        thumb: None,
        duration,
        episode: false,
    }
}

fn event(kind: &str, track: &TrackInput, delta_ms: f64) -> PlaybackEvent {
    PlaybackEvent {
        kind: kind.into(),
        track: Some(track.clone()),
        delta_ms,
    }
}

fn plays_of(service: &Service, id: &str) -> u64 {
    service.lock().buckets.iter().map(|b| b.tracks.get(id).map_or(0, |t| t.plays)).sum()
}

fn ms_of(service: &Service, id: &str) -> u64 {
    service.lock().buckets.iter().map(|b| b.tracks.get(id).map_or(0, |t| t.ms)).sum()
}

fn bucket(month: &str) -> MonthBucket {
    empty_bucket(month)
}

#[test]
fn threshold_is_half_the_length_between_the_floor_and_the_ceiling() {
    assert_eq!(threshold_ms(Some(200.0)), 100_000);
    assert_eq!(threshold_ms(Some(120.0)), 60_000);
    assert_eq!(threshold_ms(Some(40.0)), 30_000);
    assert_eq!(threshold_ms(Some(1000.0)), 240_000);
    assert_eq!(threshold_ms(None), 30_000);
    assert_eq!(threshold_ms(Some(-5.0)), 30_000);
}

#[test]
fn an_unknown_length_counts_once_thirty_seconds_are_heard() {
    let mut state = State::default();
    let song = track("a", None);
    record(&mut state, &song, 29_999, at(2026, 10, 15, 21));
    assert_eq!(state.buckets[0].tracks["a"].plays, 0);
    record(&mut state, &song, 1, at(2026, 10, 15, 21));
    assert_eq!(state.buckets[0].tracks["a"].plays, 1);
    assert_eq!(state.buckets[0].artists["artist"].plays, 1);
}

#[test]
fn a_long_song_counts_at_half_its_length_and_only_once_per_listen() {
    let mut state = State::default();
    let song = track("a", Some(200.0));
    record(&mut state, &song, 99_999, at(2026, 10, 15, 21));
    assert_eq!(state.buckets[0].tracks["a"].plays, 0);
    record(&mut state, &song, 1, at(2026, 10, 15, 21));
    record(&mut state, &song, 60_000, at(2026, 10, 15, 21));
    assert_eq!(state.buckets[0].tracks["a"].plays, 1);
    assert_eq!(state.buckets[0].tracks["a"].ms, 160_000);
}

#[tokio::test]
async fn a_loop_adds_time_without_a_second_play_and_a_new_start_rearms_it() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    let song = track("a", None);
    service.playback(&event("start", &song, 0.0), at(2026, 10, 15, 21)).expect("start");
    service.playback(&event("progress", &song, 30_000.0), at(2026, 10, 15, 21)).expect("progress");
    service.playback(&event("progress", &song, 30_000.0), at(2026, 10, 15, 21)).expect("progress");
    assert_eq!(plays_of(&service, "a"), 1);
    assert_eq!(ms_of(&service, "a"), 60_000);

    service.playback(&event("start", &song, 0.0), at(2026, 10, 15, 22)).expect("start");
    service.playback(&event("progress", &song, 30_000.0), at(2026, 10, 15, 22)).expect("progress");
    assert_eq!(plays_of(&service, "a"), 2);
}

#[tokio::test]
async fn podcast_episodes_are_never_recorded_or_journaled() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    let mut episode = track("e", Some(900.0));
    episode.episode = true;
    service.playback(&event("start", &episode, 0.0), at(2026, 10, 15, 21)).expect("start");
    service.playback(&event("stop", &episode, 120_000.0), at(2026, 10, 15, 21)).expect("stop");
    let state = service.lock();
    assert!(state.buckets.is_empty());
    assert!(state.journal.is_empty());
}

#[tokio::test]
async fn unknown_playback_events_are_rejected() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    let result = service.playback(&event("rewind", &track("a", None), 1.0), at(2026, 10, 15, 21));
    assert!(result.is_err());
}

#[test]
fn a_month_keeps_at_most_600_tracks_and_drops_the_least_heard() {
    let mut state = State::default();
    for i in 0..=MAX_TRACKS {
        record(&mut state, &track(&format!("t{i}"), None), (i as u64 + 1) * 1_000, at(2026, 10, 15, 21));
    }
    assert_eq!(state.buckets[0].tracks.len(), MAX_TRACKS);
    assert!(!state.buckets[0].tracks.contains_key("t0"));
    assert!(state.buckets[0].tracks.contains_key(&format!("t{MAX_TRACKS}")));
}

#[test]
fn a_month_keeps_at_most_400_artists() {
    let mut state = State::default();
    for i in 0..=MAX_NAMES {
        let mut song = track(&format!("t{i}"), None);
        song.artist = format!("Artist {i}");
        record(&mut state, &song, (i as u64 + 1) * 1_000, at(2026, 10, 15, 21));
    }
    assert_eq!(state.buckets[0].artists.len(), MAX_NAMES);
    assert!(!state.buckets[0].artists.contains_key("artist 0"));
}

#[test]
fn prune_keeps_the_cutoff_month_and_drops_older_ones() {
    let mut buckets = vec![bucket("2023-09"), bucket("2023-10"), bucket("2026-10")];
    prune(&mut buckets, &at(2026, 10, 15, 12));
    let months: Vec<&str> = buckets.iter().map(|b| b.month.as_str()).collect();
    assert_eq!(months, vec!["2023-10", "2026-10"]);
}

#[test]
fn prune_rolls_the_cutoff_back_across_a_year_in_january() {
    let mut buckets = vec![bucket("2022-12"), bucket("2023-01")];
    prune(&mut buckets, &at(2026, 1, 31, 12));
    let months: Vec<&str> = buckets.iter().map(|b| b.month.as_str()).collect();
    assert_eq!(months, vec!["2023-01"]);
}

#[test]
fn coerce_drops_invalid_buckets_and_keeps_the_last_of_a_duplicate_month() {
    let values = vec![
        json!({ "month": "2026-10", "tracks": {} }),
        json!({ "month": "2026-1" }),
        json!("nope"),
        json!({ "month": "2026-08", "hours": [1, 2] }),
        json!({ "month": "2026-10", "days": { "2026-10-02": 4, "bad": 1 } }),
    ];
    let buckets = coerce_buckets(&values);
    let months: Vec<&str> = buckets.iter().map(|b| b.month.as_str()).collect();
    assert_eq!(months, vec!["2026-08", "2026-10"]);
    assert_eq!(buckets[0].hours.len(), 24);
    assert_eq!(buckets[1].days.len(), 1);
}

#[test]
fn summary_periods_pick_the_right_months() {
    let mut state = State::default();
    let song = track("a", None);
    record(&mut state, &song, 1_000, at(2026, 10, 15, 21));
    record(&mut state, &song, 2_000, at(2026, 9, 3, 21));
    record(&mut state, &song, 4_000, at(2026, 1, 9, 9));
    record(&mut state, &song, 8_000, at(2025, 12, 30, 9));
    let now = at(2026, 10, 15, 22);
    let total = |period: &str| summarize(&state.buckets, period, &now)["totalMs"].as_u64().expect("total");
    assert_eq!(total("month"), 1_000);
    assert_eq!(total("lastMonth"), 2_000);
    assert_eq!(total("year"), 7_000);
    assert_eq!(total("all"), 15_000);
    assert_eq!(total("nonsense"), 1_000);
    assert_eq!(summarize(&state.buckets, "year", &now)["months"].as_array().map(Vec::len), Some(3));
}

#[test]
fn last_month_rolls_back_to_december_of_the_previous_year() {
    assert_eq!(previous_month(&at(2026, 1, 20, 9)), "2025-12");
    assert_eq!(previous_month(&at(2026, 3, 31, 9)), "2026-02");
}

#[test]
fn summary_lists_at_most_50_tracks_and_leaves_unknown_artists_out_of_the_artist_list() {
    let mut state = State::default();
    for i in 0..60 {
        record(&mut state, &track(&format!("t{i}"), None), (i as u64 + 1) * 1_000, at(2026, 10, 15, 21));
    }
    let mut anonymous = track("anon", None);
    anonymous.artist = String::new();
    record(&mut state, &anonymous, 5_000, at(2026, 10, 15, 21));
    let summary = summarize(&state.buckets, "all", &at(2026, 10, 15, 22));
    assert_eq!(summary["tracks"].as_array().map(Vec::len), Some(SUMMARY_LIMIT));
    assert_eq!(summary["counts"]["tracks"], json!(61));
    assert_eq!(summary["counts"]["artists"], json!(1));
    assert_eq!(summary["artists"][0]["name"], json!("Artist"));
    assert_eq!(summary["hours"].as_array().map(Vec::len), Some(24));
}

#[test]
fn the_summary_is_cached_until_listening_changes() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime")
        .block_on(Service::load(root.path().to_path_buf()));
    let now = at(2026, 10, 15, 22);
    service.replay_summary("all", now);
    assert_eq!(service.lock().summaries.len(), 1);
    service
        .playback(&event("progress", &track("a", None), 1_000.0), at(2026, 10, 15, 21))
        .expect("progress");
    assert!(service.lock().summaries.is_empty());
}

#[tokio::test]
async fn a_stop_writes_the_heard_seconds_to_the_journal_and_a_new_track_closes_the_last_one() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    let first = track("a", None);
    service.playback(&event("start", &first, 0.0), at(2026, 10, 15, 21)).expect("start");
    service.playback(&event("progress", &first, 31_400.0), at(2026, 10, 15, 21)).expect("progress");
    service.playback(&event("start", &track("b", None), 0.0), at(2026, 10, 15, 22)).expect("start");
    let state = service.lock();
    assert_eq!(state.journal.len(), 1);
    assert_eq!(state.journal[0].track.id, "a");
    assert_eq!(state.journal[0].heard, 31);
}

#[tokio::test]
async fn the_journal_is_exposed_for_the_week_view() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    let first = track("a", None);
    service.playback(&event("start", &first, 0.0), at(2026, 10, 15, 21)).expect("start");
    service.playback(&event("progress", &first, 31_400.0), at(2026, 10, 15, 21)).expect("progress");
    service.playback(&event("start", &track("b", None), 0.0), at(2026, 10, 15, 22)).expect("start");
    let entries = service.journal();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].track.id, "a");
    assert_eq!(entries[0].heard, 31);
}

#[test]
fn the_journal_keeps_600_entries_and_drops_entries_older_than_60_days() {
    let mut entries = Vec::new();
    let base = at(2026, 10, 15, 9);
    for i in 0..605 {
        journal_add(&mut entries, &track(&format!("t{i}"), None), 1_000, &(base + chrono::Duration::seconds(i)));
    }
    assert_eq!(entries.len(), JOURNAL_MAX);
    assert_eq!(entries[0].track.id, "t5");

    let mut aged = Vec::new();
    journal_add(&mut aged, &track("old", None), 5_000, &base);
    journal_add(&mut aged, &track("new", None), 5_000, &(base + chrono::Duration::days(61)));
    let ids: Vec<&str> = aged.iter().map(|e| e.track.id.as_str()).collect();
    assert_eq!(ids, vec!["new"]);
}

#[tokio::test(start_paused = true)]
async fn the_flush_waits_five_seconds_after_the_first_change_and_is_not_restarted_by_later_ones() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Arc::new(Service::load(root.path().to_path_buf()).await);
    tokio::spawn(service.clone().run_flush());
    tokio::task::yield_now().await;
    let song = track("a", None);

    service.playback(&event("progress", &song, 1_000.0), at(2026, 10, 15, 21)).expect("progress");
    assert!(service.lock().dirty);
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_millis(3_000)).await;
    tokio::task::yield_now().await;
    service.playback(&event("progress", &song, 1_000.0), at(2026, 10, 15, 21)).expect("progress");
    tokio::time::advance(Duration::from_millis(1_999)).await;
    tokio::task::yield_now().await;
    assert!(service.lock().dirty);

    tokio::time::advance(Duration::from_millis(1)).await;
    for _ in 0..20 {
        tokio::task::yield_now().await;
    }
    assert!(!service.lock().dirty);
}

#[tokio::test]
async fn an_exit_flush_writes_the_stats_and_the_journal() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    let song = track("a", None);
    service.playback(&event("start", &song, 0.0), at(2026, 10, 15, 21)).expect("start");
    service.playback(&event("stop", &song, 31_000.0), at(2026, 10, 15, 21)).expect("stop");
    service.flush().await;

    let stored = persist::read(root.path(), "guest", "listening-history").await.expect("stats file");
    assert_eq!(stored["version"], json!(1));
    assert_eq!(stored["state"]["buckets"][0]["tracks"]["a"]["ms"], json!(31_000));
    let journal = persist::read(root.path(), "guest", "journal").await.expect("journal file");
    assert_eq!(journal["state"]["entries"][0]["heard"], json!(31));
}

#[tokio::test]
async fn stored_listening_survives_a_restart() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    service
        .playback(&event("progress", &track("a", None), 30_000.0), at(2026, 10, 15, 21))
        .expect("progress");
    service.flush().await;

    let reloaded = Service::load(root.path().to_path_buf()).await;
    assert_eq!(plays_of(&reloaded, "a"), 1);
    assert_eq!(ms_of(&reloaded, "a"), 30_000);
}

#[tokio::test]
async fn a_failed_write_keeps_the_data_dirty_for_the_next_flush() {
    let root = tempfile::tempdir().expect("temp dir");
    let blocker = root.path().join("not-a-folder");
    std::fs::write(&blocker, b"x").expect("blocker file");
    let service = Service::load(blocker).await;
    service
        .playback(&event("progress", &track("a", None), 1_000.0), at(2026, 10, 15, 21))
        .expect("progress");
    assert!(service.write_pending().await.is_err());
    assert!(service.lock().dirty);
    assert!(service.lock().scheduled);
}

#[tokio::test]
async fn import_replaces_the_stats_and_export_returns_them() {
    let root = tempfile::tempdir().expect("temp dir");
    let service = Service::load(root.path().to_path_buf()).await;
    service
        .playback(&event("progress", &track("old", None), 30_000.0), at(2026, 10, 15, 21))
        .expect("progress");
    let incoming = vec![
        serde_json::to_value(bucket("2026-09")).expect("bucket json"),
        json!({ "month": "2019-01" }),
    ];
    service.import(&incoming).await.expect("import");
    let exported = service.export();
    assert_eq!(exported.len(), 1);
    assert_eq!(exported[0]["month"], json!("2026-09"));
    assert!(service.lock().rules.ms.is_empty());
    let stored = persist::read(root.path(), "guest", "listening-history").await.expect("stats file");
    assert_eq!(stored["state"]["buckets"].as_array().map(Vec::len), Some(1));
}

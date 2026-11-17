use super::*;

fn track(id: &str, duration: Option<f64>, episode: bool) -> TrackInput {
    TrackInput {
        id: id.to_owned(),
        title: format!("Title {id}"),
        artist: "Artist".to_owned(),
        thumb: None,
        duration,
        episode,
    }
}

fn event(kind: &str, track: &TrackInput, delta_ms: f64) -> PlaybackEvent {
    PlaybackEvent {
        kind: kind.to_owned(),
        track: Some(track.clone()),
        delta_ms,
        history: true,
    }
}

fn scrobble_of(artist: &str, title: &str, duration_ms: Option<u64>) -> Scrobble {
    Scrobble {
        artist: artist.to_owned(),
        title: title.to_owned(),
        duration_ms,
        started_at: 1_700_000_000,
        video_id: "abc".to_owned(),
    }
}

fn inner() -> Inner {
    Inner::default()
}

fn now_playing(effects: &[Effect]) -> Vec<&Scrobble> {
    effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::NowPlaying(item) => Some(item),
            Effect::Scrobble(_) => None,
        })
        .collect()
}

fn scrobbles(effects: &[Effect]) -> Vec<&Scrobble> {
    effects
        .iter()
        .filter_map(|effect| match effect {
            Effect::Scrobble(item) => Some(item),
            Effect::NowPlaying(_) => None,
        })
        .collect()
}

#[test]
fn threshold_is_half_the_length_capped_at_four_minutes() {
    assert_eq!(threshold_ms(Some(200_000)), 100_000);
    assert_eq!(threshold_ms(Some(60_000)), 30_000);
    assert_eq!(threshold_ms(Some(600_000)), 240_000);
    assert_eq!(threshold_ms(None), 240_000);
}

#[test]
fn short_tracks_and_blank_names_are_not_eligible() {
    assert!(eligible(&scrobble_of("Artist", "Title", Some(200_000))));
    assert!(eligible(&scrobble_of("Artist", "Title", None)));
    assert!(!eligible(&scrobble_of("Artist", "Title", Some(20_000))));
    assert!(!eligible(&scrobble_of("", "Title", Some(200_000))));
    assert!(!eligible(&scrobble_of("Artist", "", Some(200_000))));
}

#[test]
fn starting_a_track_sends_now_playing_once() {
    let mut state = inner();
    let song = track("a", Some(200.0), false);
    let effects = apply(&mut state, &event("start", &song, 0.0), 1_700_000_000);
    assert_eq!(now_playing(&effects).len(), 1);
    assert!(scrobbles(&effects).is_empty());
}

#[test]
fn resuming_after_a_pause_sends_now_playing_again() {
    let mut state = inner();
    let song = track("a", Some(200.0), false);
    apply(&mut state, &event("start", &song, 0.0), 1_700_000_000);
    apply(&mut state, &event("pause", &song, 5_000.0), 1_700_000_005);
    let effects = apply(&mut state, &event("resume", &song, 0.0), 1_700_000_010);
    assert_eq!(now_playing(&effects).len(), 1);
}

#[test]
fn the_scrobble_lands_at_half_the_track_length() {
    let mut state = inner();
    let song = track("a", Some(200.0), false);
    apply(&mut state, &event("start", &song, 0.0), 1_700_000_000);
    let early = apply(&mut state, &event("progress", &song, 99_000.0), 1_700_000_099);
    assert!(scrobbles(&early).is_empty());
    let late = apply(&mut state, &event("progress", &song, 2_000.0), 1_700_000_101);
    assert_eq!(scrobbles(&late).len(), 1);
    assert_eq!(scrobbles(&late)[0].started_at, 1_700_000_000);
}

#[test]
fn a_track_scrobbles_only_once_per_play() {
    let mut state = inner();
    let song = track("a", Some(60.0), false);
    apply(&mut state, &event("start", &song, 0.0), 1_700_000_000);
    let first = apply(&mut state, &event("progress", &song, 31_000.0), 1_700_000_031);
    assert_eq!(scrobbles(&first).len(), 1);
    let second = apply(&mut state, &event("progress", &song, 40_000.0), 1_700_000_071);
    assert!(scrobbles(&second).is_empty());
}

#[test]
fn podcast_episodes_never_scrobble() {
    let mut state = inner();
    let episode = track("a", Some(200.0), true);
    let effects = apply(&mut state, &event("start", &episode, 0.0), 1_700_000_000);
    assert!(now_playing(&effects).is_empty());
    let later = apply(&mut state, &event("progress", &episode, 150_000.0), 1_700_000_150);
    assert!(scrobbles(&later).is_empty());
}

#[test]
fn a_track_under_thirty_seconds_never_scrobbles() {
    let mut state = inner();
    let song = track("a", Some(20.0), false);
    apply(&mut state, &event("start", &song, 0.0), 1_700_000_000);
    let effects = apply(&mut state, &event("progress", &song, 25_000.0), 1_700_000_025);
    assert!(scrobbles(&effects).is_empty());
}

#[test]
fn stopping_clears_the_playback() {
    let mut state = inner();
    let song = track("a", Some(200.0), false);
    apply(&mut state, &event("start", &song, 0.0), 1_700_000_000);
    apply(&mut state, &event("stop", &song, 10_000.0), 1_700_000_010);
    assert!(state.play.is_none());
}

#[test]
fn the_queue_keeps_at_most_five_hundred_entries() {
    let mut queue: Vec<Queued> = (0..600)
        .map(|index| Queued {
            target: Target::LastFm,
            scrobble: scrobble_of("Artist", &format!("Title {index}"), Some(200_000)),
        })
        .collect();
    cap_queue(&mut queue);
    assert_eq!(queue.len(), 500);
    assert_eq!(queue[0].scrobble.title, "Title 100");
}

#[test]
fn lastfm_only_counts_when_a_key_and_secret_are_present() {
    assert!(!lastfm::configured());
    assert_eq!(lastfm::auth_url("tok"), "https://www.last.fm/api/auth/?api_key=&token=tok");
}

#[test]
fn the_lastfm_signature_sorts_the_parameters_by_name() {
    let params = vec![
        ("track".to_owned(), "Song".to_owned()),
        ("artist".to_owned(), "Artist".to_owned()),
    ];
    assert_eq!(lastfm::sign(&params, "secret"), "d10865a4295adf76a28d9b6cac6fa657");
}

#[test]
fn the_lastfm_signature_leaves_out_the_format_parameter() {
    let params = vec![
        ("format".to_owned(), "json".to_owned()),
        ("artist".to_owned(), "Artist".to_owned()),
    ];
    assert_eq!(lastfm::sign(&params, "secret"), lastfm::sign(&[("artist".to_owned(), "Artist".to_owned())], "secret"));
}

#[test]
fn listenbrainz_metadata_carries_the_track_and_its_origin() {
    let item = scrobble_of("Artist", "Title", Some(200_000));
    let metadata = listenbrainz::metadata(&item);
    assert_eq!(metadata["artist_name"], "Artist");
    assert_eq!(metadata["track_name"], "Title");
    assert_eq!(metadata["additional_info"]["duration_ms"], 200_000);
    assert_eq!(
        metadata["additional_info"]["origin_url"],
        "https://music.youtube.com/watch?v=abc"
    );
}

#[test]
fn a_service_only_counts_when_it_is_connected_and_enabled() {
    let mut stored = Stored::default();
    assert!(active(&stored).is_empty());
    stored.listenbrainz = Some(ListenbrainzAccount {
        token: Some("t".to_owned()),
        username: "u".to_owned(),
    });
    stored.listenbrainz_enabled = true;
    assert_eq!(active(&stored), vec![Target::ListenBrainz]);
    stored.listenbrainz_enabled = false;
    assert!(active(&stored).is_empty());
}

#[test]
fn the_status_reports_a_service_that_is_not_set_up() {
    let stored = Stored::default();
    let status = status_of(&stored);
    assert!(!status.lastfm.available);
    assert!(status.lastfm.connected == false);
    assert!(status.listenbrainz.available);
}

mod secrets_migration {
    use super::*;
    use crate::secrets::test_support::MemoryVault;

    async fn data_file(root: &std::path::Path, state: Value) {
        persist::write(root, OWNER, STORE, &json!({ "state": state, "version": VERSION }))
            .await
            .unwrap();
    }

    async fn stored_file(root: &std::path::Path) -> Value {
        persist::read(root, OWNER, STORE).await.unwrap()
    }

    fn listenbrainz_state() -> Value {
        json!({
            "listenbrainz": { "token": "lb-secret", "username": "me" },
            "listenbrainzEnabled": true,
        })
    }

    #[tokio::test]
    async fn a_plaintext_token_moves_to_the_key_store_and_leaves_the_file() {
        let dir = tempfile::tempdir().unwrap();
        data_file(dir.path(), listenbrainz_state()).await;
        let vault = Arc::new(MemoryVault::default());

        let service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        assert_eq!(vault.get(LISTENBRAINZ_TOKEN).as_deref(), Some("lb-secret"));
        let file = stored_file(dir.path()).await;
        assert_eq!(file["state"]["listenbrainz"]["username"], "me");
        assert!(file["state"]["listenbrainz"].get("token").is_none());
        assert!(!file.to_string().contains("lb-secret"));
        match service.credentials_for(Target::ListenBrainz) {
            Some(Credentials::ListenBrainz(token)) => assert_eq!(token, "lb-secret"),
            _ => panic!("the token should come from the key store"),
        }
    }

    #[tokio::test]
    async fn a_second_load_reads_the_token_from_the_key_store() {
        let dir = tempfile::tempdir().unwrap();
        data_file(dir.path(), listenbrainz_state()).await;
        let vault = Arc::new(MemoryVault::default());
        let _first = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        let second = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        match second.credentials_for(Target::ListenBrainz) {
            Some(Credentials::ListenBrainz(token)) => assert_eq!(token, "lb-secret"),
            _ => panic!("the token should come from the key store after a restart"),
        }
    }

    #[tokio::test]
    async fn a_refusing_key_store_keeps_the_token_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        data_file(dir.path(), listenbrainz_state()).await;
        let vault = MemoryVault::refusing();

        let service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        assert!(vault.get(LISTENBRAINZ_TOKEN).is_none());
        let file = stored_file(dir.path()).await;
        assert_eq!(file["state"]["listenbrainz"]["token"], "lb-secret");
        match service.credentials_for(Target::ListenBrainz) {
            Some(Credentials::ListenBrainz(token)) => assert_eq!(token, "lb-secret"),
            _ => panic!("the token should still be used when the key store refuses"),
        }
    }

    #[tokio::test]
    async fn a_lastfm_session_key_moves_to_the_key_store() {
        let dir = tempfile::tempdir().unwrap();
        data_file(
            dir.path(),
            json!({
                "lastfm": { "sessionKey": "lf-secret", "username": "me" },
                "lastfmEnabled": true,
            }),
        )
        .await;
        let vault = Arc::new(MemoryVault::default());

        let _service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        assert_eq!(vault.get(LASTFM_SESSION).as_deref(), Some("lf-secret"));
        let file = stored_file(dir.path()).await;
        assert_eq!(file["state"]["lastfm"]["username"], "me");
        assert!(!file.to_string().contains("lf-secret"));
    }

    #[tokio::test]
    async fn disconnecting_removes_the_token_from_the_key_store() {
        let dir = tempfile::tempdir().unwrap();
        data_file(dir.path(), listenbrainz_state()).await;
        let vault = Arc::new(MemoryVault::default());
        let service = Service::load(dir.path().to_path_buf(), vault.clone()).await;

        service.listenbrainz_disconnect().await;

        assert!(vault.get(LISTENBRAINZ_TOKEN).is_none());
        assert!(stored_file(dir.path()).await["state"]["listenbrainz"].is_null());
    }
}

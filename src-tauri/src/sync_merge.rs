use std::collections::{BTreeMap, BTreeSet, HashSet};

use serde_json::{json, Map, Value};

use crate::cloud_payload::strip_device_keys;
use crate::deletion_sync::{self as ds, DeletionSync};

const HISTORY_LIMIT: usize = 200;
const SEARCH_LIMIT: usize = 8;
const FORBIDDEN_KEYS: [&str; 3] = ["__proto__", "constructor", "prototype"];

struct Tombs {
    local: DeletionSync,
    remote: DeletionSync,
    joined: DeletionSync,
}

impl Tombs {
    fn new(local: &Map<String, Value>, remote: &Map<String, Value>) -> Self {
        let local = ds::from_value(local.get("deletionSync").unwrap_or(&Value::Null));
        let remote = ds::from_value(remote.get("deletionSync").unwrap_or(&Value::Null));
        let joined = ds::join(&local, &remote);
        Tombs { local, remote, joined }
    }
}

pub fn merge_settings(local: &Value, remote: &Value, first_sync: bool) -> Value {
    let remote_state = state_of(remote);
    let mut local_state = state_of(local);
    if first_sync {
        local_state.remove("autoplay");
    }
    let mut state = remote_state;
    state.extend(local_state.clone());
    let mut state = strip_device_keys(state);
    for key in crate::cloud_payload::DEVICE_SETTINGS_KEYS {
        if let Some(value) = local_state.get(key) {
            state.insert(key.to_string(), value.clone());
        }
    }
    envelope(state, version_max(local, remote))
}

pub fn merge_library(local: &Value, remote: &Value) -> Value {
    let (local_state, remote_state) = (state_of(local), state_of(remote));
    let tombs = Tombs::new(&local_state, &remote_state);
    let mut state = remote_state.clone();
    state.extend(local_state.clone());

    let liked = merge_members(&items(&local_state, "liked"), &items(&remote_state, "liked"), "liked", None, &tombs);
    let mut history = merge_members(&items(&local_state, "history"), &items(&remote_state, "history"), "history", None, &tombs);
    history.truncate(HISTORY_LIMIT);
    let followed = merge_members(
        &items(&local_state, "followedArtists"),
        &items(&remote_state, "followedArtists"),
        "followedArtists",
        None,
        &tombs,
    );
    let folders = merge_members(&items(&local_state, "folders"), &items(&remote_state, "folders"), "folders", None, &tombs);
    let folder_ids: HashSet<String> = folders.iter().filter_map(id_of).collect();
    let playlists = merge_playlists(&local_state, &remote_state, &folder_ids, &tombs);

    state.insert("liked".into(), Value::Array(liked));
    state.insert("history".into(), Value::Array(history));
    state.insert("followedArtists".into(), Value::Array(followed));
    state.insert("folders".into(), Value::Array(folders));
    state.insert("playlists".into(), Value::Array(playlists));
    state.insert("pinnedSingles".into(), union_object(&local_state, &remote_state, "pinnedSingles"));

    let live = live_keys(&state);
    state.insert("deletionSync".into(), ds::to_value(&ds::compact(&tombs.joined, &live)));
    envelope(state, version_max(local, remote).max(1))
}

pub fn merge_listening_signals(local: &Value, remote: &Value) -> Value {
    let (local_state, remote_state) = (state_of(local), state_of(remote));
    let mut state = remote_state.clone();
    state.extend(local_state.clone());
    let local_skips = object_of(&local_state, "skips");
    let remote_skips = object_of(&remote_state, "skips");
    let names: BTreeSet<&String> = local_skips.keys().chain(remote_skips.keys()).collect();
    let mut skips = Map::new();
    for name in names {
        let (a, b) = (local_skips.get(name), remote_skips.get(name));
        let count = field_u64(a, "count").max(field_u64(b, "count"));
        if count == 0 {
            continue;
        }
        let updated_at = field_u64(a, "updatedAt").max(field_u64(b, "updatedAt"));
        skips.insert(name.clone(), json!({"count": count, "updatedAt": updated_at}));
    }
    state.insert("skips".into(), Value::Object(skips));
    envelope(state, version_max(local, remote))
}

pub fn merge_recent_searches(local: &Value, remote: &Value) -> Value {
    let (local_state, remote_state) = (state_of(local), state_of(remote));
    let tombs = Tombs::new(&local_state, &remote_state);
    let mut state = remote_state.clone();
    state.extend(local_state.clone());

    let mut seen = HashSet::new();
    let mut searches: Vec<Value> = Vec::new();
    for (list, meta) in [(array_of(&local_state, "searches"), &tombs.local), (array_of(&remote_state, "searches"), &tombs.remote)] {
        for search in list.iter().filter_map(Value::as_str) {
            let search_key = search.trim().to_lowercase();
            if seen.contains(&search_key) || !ds::survives(meta, &tombs.joined, "searches", &ds::key("searches", &search_key, None)) {
                continue;
            }
            seen.insert(search_key);
            searches.push(Value::String(search.to_string()));
        }
    }
    searches.truncate(SEARCH_LIMIT);
    let live: HashSet<String> = searches
        .iter()
        .filter_map(Value::as_str)
        .map(|text| ds::key("searches", &text.trim().to_lowercase(), None))
        .collect();
    state.insert("searches".into(), Value::Array(searches));
    state.insert("deletionSync".into(), ds::to_value(&ds::compact(&tombs.joined, &live)));
    envelope(state, version_max(local, remote))
}

pub fn merge_artist_meta(local: &Value, remote: &Value) -> Value {
    let (local_state, remote_state) = (state_of(local), state_of(remote));
    let mut state = remote_state.clone();
    state.extend(local_state.clone());
    let mut by_name = object_of(&remote_state, "byName").clone();
    for (name, local_entry) in object_of(&local_state, "byName") {
        let take_local = match by_name.get(name) {
            Some(remote_entry) => field_u64(Some(local_entry), "resolvedAt") >= field_u64(Some(remote_entry), "resolvedAt"),
            None => true,
        };
        if take_local {
            by_name.insert(name.clone(), local_entry.clone());
        }
    }
    state.insert("byName".into(), Value::Object(by_name));
    envelope(state, version_max(local, remote))
}

pub fn merge_listening_history(local: &Value, remote: &Value) -> Value {
    let (local_state, remote_state) = (state_of(local), state_of(remote));
    let mut by_month: BTreeMap<String, Value> = BTreeMap::new();
    for bucket in array_of(&local_state, "buckets") {
        by_month.insert(month_of(bucket), bucket.clone());
    }
    for bucket in array_of(&remote_state, "buckets") {
        let month = month_of(bucket);
        let merged = match by_month.get(&month) {
            Some(local_bucket) => merge_bucket(local_bucket, bucket),
            None => bucket.clone(),
        };
        by_month.insert(month, merged);
    }
    let mut state = remote_state.clone();
    state.extend(local_state.clone());
    state.insert("buckets".into(), Value::Array(by_month.into_values().collect()));
    envelope(state, version_max(local, remote))
}

fn merge_bucket(local: &Value, remote: &Value) -> Value {
    let empty = Map::new();
    let local_map = local.as_object().unwrap_or(&empty);
    let remote_map = remote.as_object().unwrap_or(&empty);
    let mut out = local_map.clone();
    out.insert(
        "tracks".into(),
        Value::Object(merge_records(object_of(local_map, "tracks"), object_of(remote_map, "tracks"))),
    );
    out.insert(
        "artists".into(),
        Value::Object(merge_records(object_of(local_map, "artists"), object_of(remote_map, "artists"))),
    );
    let local_hours = array_numbers(local, "hours");
    let remote_hours = array_numbers(remote, "hours");
    let width = local_hours.len().max(remote_hours.len());
    let hours: Vec<Value> = (0..width)
        .map(|index| {
            let a = local_hours.get(index).copied().unwrap_or(0);
            let b = remote_hours.get(index).copied().unwrap_or(0);
            json!(a.max(b))
        })
        .collect();
    out.insert("hours".into(), Value::Array(hours));
    let mut days = object_of(remote_map, "days").clone();
    for (day, count) in object_of(local_map, "days") {
        let merged = count.as_u64().unwrap_or(0).max(field_u64_value(days.get(day)));
        days.insert(day.clone(), json!(merged));
    }
    let days: Map<String, Value> = days.into_iter().filter(|(key, _)| !is_forbidden(key)).collect();
    out.insert("days".into(), Value::Object(days));
    Value::Object(out)
}

fn field_u64_value(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

fn merge_records(local: &Map<String, Value>, remote: &Map<String, Value>) -> Map<String, Value> {
    let mut out = local.clone();
    for (key, remote_record) in remote {
        if is_forbidden(key) {
            continue;
        }
        let take_remote = match out.get(key) {
            Some(local_record) => field_u64(Some(remote_record), "ms") > field_u64(Some(local_record), "ms"),
            None => true,
        };
        if take_remote {
            out.insert(key.clone(), remote_record.clone());
        }
    }
    out
}

fn merge_members(local: &[Value], remote: &[Value], group: &str, parent: Option<&str>, tombs: &Tombs) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for (items, meta) in [(local, &tombs.local), (remote, &tombs.remote)] {
        for item in items {
            let Some(id) = id_of(item) else { continue };
            if seen.contains(&id) || !ds::survives(meta, &tombs.joined, group, &ds::key(group, &id, parent)) {
                continue;
            }
            seen.insert(id);
            out.push(item.clone());
        }
    }
    out
}

fn merge_playlists(local: &Map<String, Value>, remote: &Map<String, Value>, folder_ids: &HashSet<String>, tombs: &Tombs) -> Vec<Value> {
    let local_playlists = items(local, "playlists");
    let remote_playlists = items(remote, "playlists");
    let ids: Vec<String> = local_playlists.iter().chain(remote_playlists.iter()).filter_map(id_of).collect();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for id in ids {
        if !seen.insert(id.clone()) {
            continue;
        }
        let meta_key = ds::key("playlists", &id, None);
        let survives_local = local_playlists.iter().any(|p| id_of(p).as_deref() == Some(&id)) && ds::survives(&tombs.local, &tombs.joined, "playlists", &meta_key);
        let survives_remote = remote_playlists.iter().any(|p| id_of(p).as_deref() == Some(&id)) && ds::survives(&tombs.remote, &tombs.joined, "playlists", &meta_key);
        if !survives_local && !survives_remote {
            continue;
        }
        let local_record = local_playlists.iter().find(|p| id_of(p).as_deref() == Some(&id));
        let remote_record = remote_playlists.iter().find(|p| id_of(p).as_deref() == Some(&id));
        let mut record = local_record.or(remote_record).and_then(Value::as_object).cloned().unwrap_or_default();
        let tracks = merge_members(&playlist_tracks(local_record), &playlist_tracks(remote_record), "tracks", Some(&id), tombs);
        record.insert("tracks".into(), Value::Array(tracks));
        let ordered = field_u64(local_record, "orderedAt").max(field_u64(remote_record, "orderedAt"));
        if ordered > 0 {
            record.insert("orderedAt".into(), json!(ordered));
        }
        let folder_missing = record
            .get("folderId")
            .and_then(Value::as_str)
            .is_some_and(|folder| !folder_ids.contains(folder));
        if folder_missing {
            record.insert("folderId".into(), Value::Null);
        }
        out.push(Value::Object(record));
    }
    out
}

fn playlist_tracks(playlist: Option<&Value>) -> Vec<Value> {
    playlist.and_then(|p| p.get("tracks")).and_then(Value::as_array).cloned().unwrap_or_default()
}

fn live_keys(state: &Map<String, Value>) -> HashSet<String> {
    let mut keys = HashSet::new();
    for group in ["liked", "history", "followedArtists", "folders", "playlists"] {
        for item in items(state, group) {
            if let Some(id) = id_of(&item) {
                keys.insert(ds::key(group, &id, None));
            }
        }
    }
    for playlist in items(state, "playlists") {
        let Some(playlist_id) = id_of(&playlist) else { continue };
        for track in playlist_tracks(Some(&playlist)) {
            if let Some(track_id) = id_of(&track) {
                keys.insert(ds::key("tracks", &track_id, Some(&playlist_id)));
            }
        }
    }
    keys
}

fn union_object(local: &Map<String, Value>, remote: &Map<String, Value>, key: &str) -> Value {
    let mut out = object_of(remote, key).clone();
    out.extend(object_of(local, key).clone());
    Value::Object(out)
}

fn items(state: &Map<String, Value>, key: &str) -> Vec<Value> {
    array_of(state, key).to_vec()
}

fn array_of<'a>(state: &'a Map<String, Value>, key: &str) -> &'a [Value] {
    state.get(key).and_then(Value::as_array).map_or(&[], Vec::as_slice)
}

fn array_numbers(value: &Value, key: &str) -> Vec<u64> {
    value.get(key).and_then(Value::as_array).map(|list| list.iter().map(|n| n.as_u64().unwrap_or(0)).collect()).unwrap_or_default()
}

fn object_of<'a>(state: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    static EMPTY: std::sync::LazyLock<Map<String, Value>> = std::sync::LazyLock::new(Map::new);
    state.get(key).and_then(Value::as_object).unwrap_or(&EMPTY)
}

fn field_u64(record: Option<&Value>, key: &str) -> u64 {
    record.and_then(|value| value.get(key)).and_then(Value::as_u64).unwrap_or(0)
}

fn id_of(value: &Value) -> Option<String> {
    value.get("id").and_then(Value::as_str).map(str::to_owned)
}

fn month_of(bucket: &Value) -> String {
    bucket.get("month").and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn is_forbidden(key: &str) -> bool {
    FORBIDDEN_KEYS.contains(&key)
}

fn state_of(envelope: &Value) -> Map<String, Value> {
    envelope.get("state").and_then(Value::as_object).cloned().unwrap_or_default()
}

fn version_max(a: &Value, b: &Value) -> u64 {
    field_u64(Some(a), "version").max(field_u64(Some(b), "version"))
}

fn envelope(state: Map<String, Value>, version: u64) -> Value {
    json!({"schema": 1, "state": state, "version": version})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(id: &str, ms: u64) -> Value {
        json!({"id": id, "title": id, "artist": "a", "album": null, "duration": 1, "explicit": false, "ms": ms})
    }

    fn file(state: Value, version: u64) -> Value {
        json!({"schema": 1, "state": state, "version": version})
    }

    fn with_tombs(state: Value, deletion: &DeletionSync) -> Value {
        let mut state = state;
        state["deletionSync"] = ds::to_value(deletion);
        state
    }

    fn list(merged: &Value, key: &str) -> Vec<String> {
        merged["state"][key]
            .as_array()
            .map(|items| items.iter().filter_map(id_of).collect())
            .unwrap_or_default()
    }

    #[test]
    fn deleting_a_playlist_on_one_device_keeps_its_songs_elsewhere() {
        let playlist_key = ds::key("playlists", "p1", None);
        let deleted_on_a = DeletionSync { clock: 50, deletes: [(playlist_key.clone(), 50)].into(), ..Default::default() };
        let a = file(with_tombs(json!({"playlists": [], "liked": [], "history": []}), &deleted_on_a), 4);
        let b_state = json!({
            "liked": [track("song1", 1)],
            "history": [track("song1", 1)],
            "playlists": [{"id": "p1", "name": "Mix", "folderId": null, "pinned": false, "tracks": [track("song1", 1)]}],
        });
        let add_key = ds::key("playlists", "p1", None);
        let b = file(with_tombs(b_state, &DeletionSync { clock: 10, adds: [(add_key, 10)].into(), ..Default::default() }), 4);
        let merged = merge_library(&b, &a);
        assert_eq!(list(&merged, "liked"), vec!["song1"]);
        assert_eq!(list(&merged, "history"), vec!["song1"]);
        assert!(list(&merged, "playlists").is_empty());
    }

    #[test]
    fn a_track_removed_from_a_playlist_on_one_device_stays_in_liked() {
        let track_key = ds::key("tracks", "t1", Some("p1"));
        let removed = DeletionSync { clock: 30, deletes: [(track_key, 30)].into(), ..Default::default() };
        let a = file(with_tombs(json!({"playlists": [{"id": "p1", "tracks": []}]}), &removed), 4);
        let b = file(
            json!({"liked": [track("t1", 1)], "playlists": [{"id": "p1", "tracks": [track("t1", 1)]}]}),
            4,
        );
        let merged = merge_library(&a, &b);
        assert_eq!(list(&merged, "liked"), vec!["t1"]);
        assert!(merged["state"]["playlists"][0]["tracks"].as_array().unwrap().is_empty());
    }

    #[test]
    fn a_delete_on_one_device_removes_the_liked_song_everywhere() {
        let liked_key = ds::key("liked", "t1", None);
        let removed = DeletionSync { clock: 20, adds: [(liked_key.clone(), 5)].into(), deletes: [(liked_key, 20)].into(), ..Default::default() };
        let a = file(with_tombs(json!({"liked": []}), &removed), 4);
        let b = file(json!({"liked": [track("t1", 1)]}), 4);
        assert!(list(&merge_library(&a, &b), "liked").is_empty());
    }

    #[test]
    fn a_re_added_song_survives_an_older_delete() {
        let liked_key = ds::key("liked", "t1", None);
        let a = file(with_tombs(json!({"liked": []}), &DeletionSync { clock: 20, adds: [(liked_key.clone(), 5)].into(), deletes: [(liked_key.clone(), 9)].into(), ..Default::default() }), 4);
        let b = file(
            with_tombs(json!({"liked": [track("t1", 1)]}), &DeletionSync { clock: 30, adds: [(liked_key, 25)].into(), ..Default::default() }),
            4,
        );
        assert_eq!(list(&merge_library(&a, &b), "liked"), vec!["t1"]);
    }

    #[test]
    fn library_merge_is_idempotent() {
        let a = file(json!({"liked": [track("t1", 1)], "playlists": [{"id": "p1", "tracks": [track("t2", 1)]}]}), 4);
        let b = file(json!({"liked": [track("t3", 1)], "folders": [{"id": "f1", "name": "x"}]}), 4);
        let once = merge_library(&a, &b);
        assert_eq!(merge_library(&once, &b), once);
        assert_eq!(merge_library(&once, &a), once);
    }

    #[test]
    fn dangling_folder_ids_are_unfiled_and_version_is_at_least_one() {
        let a = file(json!({"playlists": [{"id": "p1", "folderId": "gone", "tracks": []}]}), 0);
        let merged = merge_library(&a, &file(json!({}), 0));
        assert_eq!(merged["state"]["playlists"][0]["folderId"], Value::Null);
        assert_eq!(merged["version"], json!(1));
    }

    #[test]
    fn pinned_singles_keep_local_values_over_remote() {
        let a = file(json!({"pinnedSingles": {"liked": false, "v2": true}}), 4);
        let b = file(json!({"pinnedSingles": {"liked": true, "replay": true}}), 4);
        let merged = merge_library(&a, &b);
        assert_eq!(merged["state"]["pinnedSingles"], json!({"liked": false, "replay": true, "v2": true}));
    }

    #[test]
    fn settings_strip_device_keys_and_keep_local_device_values() {
        let remote = file(json!({"crossfadeSeconds": 4, "downloadDir": "C:\\remote", "theme": "dark"}), 1);
        let local = file(json!({"crossfadeSeconds": 6, "downloadDir": "D:\\mine", "lyricsOffset": 0.5}), 2);
        let merged = merge_settings(&local, &remote, false);
        assert_eq!(merged["state"]["crossfadeSeconds"], json!(6));
        assert_eq!(merged["state"]["theme"], json!("dark"));
        assert_eq!(merged["state"]["downloadDir"], json!("D:\\mine"));
        assert_eq!(merged["state"]["lyricsOffset"], json!(0.5));
        assert_eq!(merged["version"], json!(2));
    }

    #[test]
    fn first_settings_sync_drops_local_autoplay_before_merging() {
        let remote = file(json!({"autoplay": true}), 1);
        let local = file(json!({"autoplay": false, "theme": "light"}), 1);
        assert_eq!(merge_settings(&local, &remote, true)["state"]["autoplay"], json!(true));
        assert_eq!(merge_settings(&local, &remote, false)["state"]["autoplay"], json!(false));
    }

    #[test]
    fn signal_counts_take_the_larger_side_and_drop_zero() {
        let a = file(json!({"skips": {"artist a": {"count": 3, "updatedAt": 10}, "gone": {"count": 0, "updatedAt": 1}}}), 1);
        let b = file(json!({"skips": {"artist a": {"count": 5, "updatedAt": 4}, "artist b": {"count": 1, "updatedAt": 7}}}), 2);
        let merged = merge_listening_signals(&a, &b);
        assert_eq!(merged["state"]["skips"]["artist a"], json!({"count": 5, "updatedAt": 10}));
        assert_eq!(merged["state"]["skips"]["artist b"], json!({"count": 1, "updatedAt": 7}));
        assert!(merged["state"]["skips"].get("gone").is_none());
        assert_eq!(merged["version"], json!(2));
    }

    #[test]
    fn a_search_deleted_on_one_side_stays_gone_and_the_list_is_capped() {
        let key = ds::key("searches", "rock", None);
        let a = file(with_tombs(json!({"searches": ["Jazz"]}), &DeletionSync { clock: 9, deletes: [(key.clone(), 9)].into(), adds: [(key, 2)].into(), ..Default::default() }), 1);
        let many: Vec<String> = (0..10).map(|n| format!("s{n}")).collect();
        let b = file(json!({"searches": ["rock", "  jazz  ", many[0], many[1], many[2], many[3], many[4], many[5], many[6], many[7], many[8]]}), 1);
        let merged = merge_recent_searches(&a, &b);
        let searches: Vec<&str> = merged["state"]["searches"].as_array().unwrap().iter().filter_map(Value::as_str).collect();
        assert_eq!(searches.len(), SEARCH_LIMIT);
        assert!(!searches.contains(&"rock"));
        assert_eq!(searches[0], "Jazz");
    }

    #[test]
    fn artist_meta_keeps_the_newer_entry_and_equal_times_keep_local() {
        let a = file(json!({"byName": {"x": {"id": "1", "name": "X", "thumb": null, "resolvedAt": 5}, "y": {"id": "2", "name": "Y", "thumb": "local", "resolvedAt": 7}}}), 1);
        let b = file(json!({"byName": {"x": {"id": "9", "name": "X", "thumb": null, "resolvedAt": 8}, "y": {"id": "2", "name": "Y", "thumb": "remote", "resolvedAt": 7}}}), 1);
        let merged = merge_artist_meta(&a, &b);
        assert_eq!(merged["state"]["byName"]["x"]["id"], json!("9"));
        assert_eq!(merged["state"]["byName"]["y"]["thumb"], json!("local"));
    }

    #[test]
    fn history_merge_takes_the_greater_ms_and_unions_months() {
        let a = file(json!({"buckets": [{"month": "2026-10", "tracks": {"t": {"ms": 100, "plays": 1}}, "hours": [1, 0], "days": {"2026-10-01": 2}}]}), 1);
        let b = file(json!({"buckets": [
            {"month": "2026-10", "tracks": {"t": {"ms": 250, "plays": 3}}, "hours": [0, 4, 7], "days": {"2026-10-01": 1, "__proto__": 9}},
            {"month": "2026-09", "tracks": {}, "hours": [], "days": {}}
        ]}), 1);
        let merged = merge_listening_history(&a, &b);
        let buckets = merged["state"]["buckets"].as_array().unwrap();
        assert_eq!(buckets[0]["month"], json!("2026-09"));
        let october = &buckets[1];
        assert_eq!(october["tracks"]["t"], json!({"ms": 250, "plays": 3}));
        assert_eq!(october["hours"], json!([1, 4, 7]));
        assert_eq!(october["days"], json!({"2026-10-01": 2}));
    }

    #[test]
    fn history_merge_is_idempotent_and_order_free_on_distinct_ms() {
        let a = file(json!({"buckets": [{"month": "2026-10", "tracks": {"t": {"ms": 100}}, "hours": [1], "days": {}}]}), 1);
        let b = file(json!({"buckets": [{"month": "2026-10", "tracks": {"t": {"ms": 200}, "u": {"ms": 5}}, "hours": [0, 3], "days": {}}]}), 1);
        let ab = merge_listening_history(&a, &b);
        assert_eq!(merge_listening_history(&ab, &b), ab);
        assert_eq!(merge_listening_history(&b, &a)["state"]["buckets"], ab["state"]["buckets"]);
    }
}

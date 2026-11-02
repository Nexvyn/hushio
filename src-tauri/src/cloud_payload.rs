use std::collections::HashSet;

use serde_json::{json, Map, Value};

pub const MAX_CLOUD_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
pub const LISTENING_HISTORY_BUDGET_BYTES: usize = 6 * 1024 * 1024;
pub const DEVICE_SETTINGS_KEYS: [&str; 5] = ["downloadDir", "localMusicFolder", "audioSinkId", "lyricsOffset", "closeToTray"];
pub const INVALID_SYNC_DATA: &str = "Invalid sync data.";

const MAX_NODES: usize = 200_000;
const MAX_DEPTH: usize = 24;
const MAX_ARRAY_LEN: usize = 50_000;
const MAX_KEY_CHARS: usize = 1024;
const MAX_STRING_BYTES: usize = 8 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 16_384;
const MAX_ID_CHARS: usize = 1024;
const MAX_LIBRARY_ORDER: usize = 5000;
const MAX_LIBRARY_ORDER_CHARS: usize = 200;
const MAX_ARTIST_META: usize = 400;
const MAX_RECENT_SEARCHES: usize = 50;
const MAX_HISTORY_MONTHS: usize = 36;
const MAX_HISTORY_TRACKS: usize = 600;
const MAX_HISTORY_ARTISTS: usize = 400;
const FORBIDDEN_KEYS: [&str; 3] = ["__proto__", "constructor", "prototype"];
const TEXT_KEYS: [&str; 3] = ["name", "title", "text"];
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug)]
pub struct Checked {
    pub payload: Value,
    pub sanitized: bool,
}

pub fn strip_device_keys(mut state: Map<String, Value>) -> Map<String, Value> {
    for key in DEVICE_SETTINGS_KEYS {
        state.remove(key);
    }
    state
}

pub fn payload_bytes(value: &Value) -> usize {
    serde_json::to_vec(value).map_or(usize::MAX, |bytes| bytes.len())
}

pub fn for_upload(name: &str, file: &Value) -> Value {
    let version = file.get("version").cloned().unwrap_or(json!(0));
    let mut state = file.get("state").and_then(Value::as_object).cloned().unwrap_or_default();
    match name {
        "settings" => state = strip_device_keys(state),
        "library" => strip_library(&mut state),
        _ => {}
    }
    json!({"schema": 1, "state": state, "version": version})
}

pub fn prepare_upload(name: &str, file: &Value) -> Result<Value, String> {
    let mut payload = for_upload(name, file);
    if name == "listening-history" {
        payload = fit_to_budget(payload, LISTENING_HISTORY_BUDGET_BYTES);
    }
    let size = payload_bytes(&payload);
    if size > MAX_CLOUD_PAYLOAD_BYTES {
        return Err(format!("\"{name}\" is {size} bytes, over the {MAX_CLOUD_PAYLOAD_BYTES} byte cloud limit."));
    }
    Ok(payload)
}

pub fn fit_to_budget(mut payload: Value, budget: usize) -> Value {
    loop {
        if payload_bytes(&payload) <= budget {
            break;
        }
        let Some(buckets) = payload.pointer_mut("/state/buckets").and_then(Value::as_array_mut) else {
            break;
        };
        let Some(oldest) = (0..buckets.len()).min_by(|&a, &b| month_of(&buckets[a]).cmp(&month_of(&buckets[b]))) else {
            break;
        };
        buckets.remove(oldest);
    }
    payload
}

pub fn validate(payload: &Value, exact_version: Option<u64>) -> Result<Checked, &'static str> {
    if payload_bytes(payload) > MAX_CLOUD_PAYLOAD_BYTES {
        return Err(INVALID_SYNC_DATA);
    }
    let mut nodes = 0;
    walk(payload, 0, &mut nodes).ok_or(INVALID_SYNC_DATA)?;
    let root = payload.as_object().ok_or(INVALID_SYNC_DATA)?;
    if root.get("schema").and_then(Value::as_u64) != Some(1) {
        return Err(INVALID_SYNC_DATA);
    }
    let version = root
        .get("version")
        .and_then(Value::as_u64)
        .filter(|version| *version <= MAX_SAFE_INTEGER)
        .ok_or(INVALID_SYNC_DATA)?;
    if exact_version.is_some_and(|exact| exact != version) {
        return Err(INVALID_SYNC_DATA);
    }
    if !root.get("state").is_some_and(Value::is_object) {
        return Err(INVALID_SYNC_DATA);
    }
    let mut payload = payload.clone();
    let mut sanitized = false;
    repair(&mut payload, &mut sanitized);
    Ok(Checked { payload, sanitized })
}

fn strip_library(state: &mut Map<String, Value>) {
    state.remove("downloads");
    for key in ["liked", "history"] {
        if let Some(tracks) = state.get_mut(key) {
            strip_local_paths(tracks);
        }
    }
    if let Some(playlists) = state.get_mut("playlists").and_then(Value::as_array_mut) {
        playlists.retain(|playlist| playlist.get("remote").is_none_or(Value::is_null));
        for playlist in playlists.iter_mut() {
            if let Some(tracks) = playlist.get_mut("tracks") {
                strip_local_paths(tracks);
            }
        }
    }
}

fn strip_local_paths(tracks: &mut Value) {
    if let Some(list) = tracks.as_array_mut() {
        for track in list {
            if let Some(object) = track.as_object_mut() {
                object.remove("localPath");
            }
        }
    }
}

fn walk(value: &Value, depth: usize, nodes: &mut usize) -> Option<()> {
    *nodes += 1;
    if *nodes > MAX_NODES || depth > MAX_DEPTH {
        return None;
    }
    match value {
        Value::Array(items) => {
            if items.len() > MAX_ARRAY_LEN {
                return None;
            }
            items.iter().try_for_each(|item| walk(item, depth + 1, nodes))
        }
        Value::Object(map) => {
            for (key, child) in map {
                if key.chars().count() > MAX_KEY_CHARS || is_forbidden(key) {
                    return None;
                }
                if key == "id" && !valid_id(child) {
                    return None;
                }
                walk(child, depth + 1, nodes)?;
            }
            Some(())
        }
        Value::String(text) if text.len() > MAX_STRING_BYTES => None,
        _ => Some(()),
    }
}

fn valid_id(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|id| (1..=MAX_ID_CHARS).contains(&id.chars().count()) && !is_forbidden(id))
}

fn repair(payload: &mut Value, sanitized: &mut bool) {
    clip_text(payload, sanitized);
    let Some(state) = payload.get_mut("state").and_then(Value::as_object_mut) else {
        return;
    };
    trim_library_order(state, sanitized);
    cap_list(state, "searches", MAX_RECENT_SEARCHES, sanitized);
    cap_artist_meta(state, sanitized);
    settings_ranges(state, sanitized);
    cap_history(state, sanitized);
}

fn clip_text(value: &mut Value, sanitized: &mut bool) {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter_mut() {
                if TEXT_KEYS.contains(&key.as_str()) {
                    if let Value::String(text) = child {
                        if text.chars().count() > MAX_TEXT_CHARS {
                            *text = text.chars().take(MAX_TEXT_CHARS).collect();
                            *sanitized = true;
                        }
                    }
                }
                clip_text(child, sanitized);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|item| clip_text(item, sanitized)),
        _ => {}
    }
}

fn trim_library_order(state: &mut Map<String, Value>, sanitized: &mut bool) {
    let Some(order) = state.get_mut("libraryOrder").and_then(Value::as_array_mut) else {
        return;
    };
    let before = order.len();
    order.retain(|entry| entry.as_str().is_some_and(|key| (1..=MAX_LIBRARY_ORDER_CHARS).contains(&key.chars().count())));
    order.truncate(MAX_LIBRARY_ORDER);
    *sanitized |= order.len() != before;
}

fn cap_list(state: &mut Map<String, Value>, key: &str, max: usize, sanitized: &mut bool) {
    if let Some(list) = state.get_mut(key).and_then(Value::as_array_mut) {
        if list.len() > max {
            list.truncate(max);
            *sanitized = true;
        }
    }
}

fn cap_artist_meta(state: &mut Map<String, Value>, sanitized: &mut bool) {
    if let Some(by_name) = state.get_mut("byName").and_then(Value::as_object_mut) {
        keep_newest(by_name, MAX_ARTIST_META, "resolvedAt", sanitized);
    }
}

fn cap_history(state: &mut Map<String, Value>, sanitized: &mut bool) {
    let Some(buckets) = state.get_mut("buckets").and_then(Value::as_array_mut) else {
        return;
    };
    if buckets.len() > MAX_HISTORY_MONTHS {
        buckets.sort_by(|a, b| month_of(a).cmp(&month_of(b)));
        let excess = buckets.len() - MAX_HISTORY_MONTHS;
        buckets.drain(..excess);
        *sanitized = true;
    }
    for bucket in buckets.iter_mut().filter_map(Value::as_object_mut) {
        keep_newest(bucket.get_mut("tracks").and_then(Value::as_object_mut).unwrap_or(&mut Map::new()), MAX_HISTORY_TRACKS, "ms", sanitized);
        keep_newest(bucket.get_mut("artists").and_then(Value::as_object_mut).unwrap_or(&mut Map::new()), MAX_HISTORY_ARTISTS, "ms", sanitized);
    }
}

fn keep_newest(records: &mut Map<String, Value>, max: usize, rank_key: &str, sanitized: &mut bool) {
    if records.len() <= max {
        return;
    }
    let mut ranked: Vec<(String, u64)> = records
        .iter()
        .map(|(key, record)| (key.clone(), record.get(rank_key).and_then(Value::as_u64).unwrap_or(0)))
        .collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let keep: HashSet<String> = ranked.into_iter().take(max).map(|(key, _)| key).collect();
    records.retain(|key, _| keep.contains(key));
    *sanitized = true;
}

fn settings_ranges(state: &mut Map<String, Value>, sanitized: &mut bool) {
    drop_unless(state, sanitized, "crossfadeSeconds", |value| value.as_f64().is_some_and(|n| (0.0..=30.0).contains(&n)));
    drop_unless(state, sanitized, "playbackSpeed", |value| value.as_f64().is_some_and(|n| (0.0..=2.0).contains(&n)));
    drop_unless(state, sanitized, "loudnessLevel", |value| one_of(value, &["off", "quiet", "normal", "loud"]));
    drop_unless(state, sanitized, "downloadQuality", |value| one_of(value, &["standard", "high", "lossless"]));
    drop_unless(state, sanitized, "streamingQuality", |value| one_of(value, &["low", "medium", "high", "lossless"]));
}

fn drop_unless(state: &mut Map<String, Value>, sanitized: &mut bool, key: &str, valid: impl Fn(&Value) -> bool) {
    if state.get(key).is_some_and(|value| !valid(value)) {
        state.remove(key);
        *sanitized = true;
    }
}

fn one_of(value: &Value, options: &[&str]) -> bool {
    value.as_str().is_some_and(|text| options.contains(&text))
}

fn month_of(bucket: &Value) -> String {
    bucket.get("month").and_then(Value::as_str).unwrap_or_default().to_owned()
}

fn is_forbidden(key: &str) -> bool {
    FORBIDDEN_KEYS.contains(&key)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sized_library(target: usize) -> Value {
        let base = payload_bytes(&json!({"schema": 1, "state": {"blob": ""}, "version": 4}));
        json!({"state": {"blob": "x".repeat(target - base)}, "version": 4})
    }

    fn history_bucket(month: &str, pad: usize) -> Value {
        json!({"month": month, "tracks": {}, "artists": {}, "hours": [0], "days": {}, "pad": "x".repeat(pad)})
    }

    fn valid(state: Value) -> Value {
        json!({"schema": 1, "state": state, "version": 1})
    }

    #[test]
    fn upload_at_exactly_the_eight_mib_cap_is_allowed() {
        let at_cap = sized_library(MAX_CLOUD_PAYLOAD_BYTES);
        let payload = prepare_upload("library", &at_cap).unwrap();
        assert_eq!(payload_bytes(&payload), MAX_CLOUD_PAYLOAD_BYTES);
    }

    #[test]
    fn upload_one_byte_over_the_eight_mib_cap_is_refused() {
        let over = sized_library(MAX_CLOUD_PAYLOAD_BYTES + 1);
        assert!(prepare_upload("library", &over).unwrap_err().contains("over the 8388608 byte cloud limit"));
    }

    #[test]
    fn listening_history_is_trimmed_oldest_first_to_fit_its_budget() {
        let buckets = vec![history_bucket("2026-07", 1000), history_bucket("2026-09", 1000), history_bucket("2026-08", 1000)];
        let file = json!({"state": {"buckets": buckets}, "version": 1});
        let full = for_upload("listening-history", &file);
        let mut newest_two = full.clone();
        newest_two["state"]["buckets"].as_array_mut().unwrap().remove(0);
        let budget = payload_bytes(&newest_two);
        let fitted = fit_to_budget(full, budget);
        let mut months: Vec<String> = fitted["state"]["buckets"].as_array().unwrap().iter().map(month_of).collect();
        months.sort();
        assert_eq!(months, vec!["2026-08", "2026-09"]);
        assert_eq!(payload_bytes(&fitted), budget);
    }

    #[test]
    fn fitting_stops_when_no_bucket_is_left() {
        let file = json!({"state": {"buckets": [history_bucket("2026-07", 50_000)]}, "version": 1});
        let fitted = fit_to_budget(for_upload("listening-history", &file), 100);
        assert!(fitted["state"]["buckets"].as_array().unwrap().is_empty());
    }

    #[test]
    fn settings_upload_drops_the_five_device_keys() {
        let file = json!({"state": {"theme": "dark", "downloadDir": "C:\\x", "localMusicFolder": "D:\\m", "audioSinkId": "a", "lyricsOffset": 1, "closeToTray": true}, "version": 1});
        let payload = for_upload("settings", &file);
        assert_eq!(payload["state"], json!({"theme": "dark"}));
        assert_eq!(payload["schema"], json!(1));
    }

    #[test]
    fn library_upload_drops_downloads_linked_playlists_and_local_paths() {
        let file = json!({"state": {
            "downloads": {"t1": {}},
            "liked": [{"id": "t1", "localPath": "C:\\a.m4a"}],
            "history": [{"id": "t2", "localPath": "C:\\b.m4a"}],
            "playlists": [
                {"id": "linked", "remote": {"ytPlaylistId": "PL1"}, "tracks": [{"id": "t3", "localPath": "C:\\c.m4a"}]},
                {"id": "local", "remote": null, "tracks": [{"id": "t4", "localPath": "C:\\d.m4a"}]}
            ]
        }, "version": 4});
        let payload = for_upload("library", &file);
        assert!(payload["state"].get("downloads").is_none());
        assert!(payload["state"]["liked"][0].get("localPath").is_none());
        assert!(payload["state"]["history"][0].get("localPath").is_none());
        let playlists = payload["state"]["playlists"].as_array().unwrap();
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0]["id"], json!("local"));
        assert!(playlists[0]["tracks"][0].get("localPath").is_none());
    }

    #[test]
    fn a_clean_payload_passes_unchanged() {
        let payload = valid(json!({"liked": [{"id": "t1"}]}));
        let checked = validate(&payload, Some(1)).unwrap();
        assert!(!checked.sanitized);
        assert_eq!(checked.payload, payload);
    }

    #[test]
    fn structural_violations_are_refused() {
        assert_eq!(validate(&json!({"state": {}, "version": 1}), None).unwrap_err(), INVALID_SYNC_DATA);
        assert!(validate(&json!({"schema": 2, "state": {}, "version": 1}), None).is_err());
        assert!(validate(&json!({"schema": 1, "state": [], "version": 1}), None).is_err());
        assert!(validate(&json!({"schema": 1, "state": {}, "version": -1}), None).is_err());
        assert!(validate(&json!({"schema": 1, "state": {}, "version": 1.5}), None).is_err());
        assert!(validate(&valid(json!({"__proto__": {}})), None).is_err());
        assert!(validate(&valid(json!({"liked": [{"id": ""}]})), None).is_err());
        assert!(validate(&valid(json!({"liked": [{"id": 7}]})), None).is_err());
    }

    #[test]
    fn exact_version_is_required_when_asked_for() {
        let payload = json!({"schema": 1, "state": {}, "version": 2});
        assert!(validate(&payload, Some(1)).is_err());
        assert!(validate(&payload, None).is_ok());
    }

    #[test]
    fn nesting_deeper_than_24_levels_is_refused() {
        let mut deep = json!(1);
        for _ in 0..30 {
            deep = json!([deep]);
        }
        assert!(validate(&valid(json!({"deep": deep})), None).is_err());
    }

    #[test]
    fn long_text_is_clipped_and_reported() {
        let payload = valid(json!({"liked": [{"id": "t1", "title": "x".repeat(MAX_TEXT_CHARS + 5)}]}));
        let checked = validate(&payload, None).unwrap();
        assert!(checked.sanitized);
        assert_eq!(checked.payload["state"]["liked"][0]["title"].as_str().unwrap().chars().count(), MAX_TEXT_CHARS);
    }

    #[test]
    fn library_order_drops_bad_entries_and_caps_the_count() {
        let mut order: Vec<Value> = vec![json!(""), json!("ok"), json!("x".repeat(MAX_LIBRARY_ORDER_CHARS + 1)), json!(4)];
        order.extend((0..MAX_LIBRARY_ORDER).map(|n| json!(format!("k{n}"))));
        let checked = validate(&valid(json!({"libraryOrder": order})), None).unwrap();
        let kept = checked.payload["state"]["libraryOrder"].as_array().unwrap();
        assert_eq!(kept.len(), MAX_LIBRARY_ORDER);
        assert_eq!(kept[0], json!("ok"));
        assert!(checked.sanitized);
    }

    #[test]
    fn searches_are_capped_at_fifty() {
        let searches: Vec<String> = (0..MAX_RECENT_SEARCHES + 1).map(|n| format!("s{n}")).collect();
        let checked = validate(&valid(json!({"searches": searches})), None).unwrap();
        assert_eq!(checked.payload["state"]["searches"].as_array().unwrap().len(), MAX_RECENT_SEARCHES);
        assert!(checked.sanitized);
    }

    #[test]
    fn artist_meta_keeps_the_newest_400_entries() {
        let mut by_name = Map::new();
        for n in 0..=MAX_ARTIST_META {
            by_name.insert(format!("artist {n}"), json!({"id": "1", "name": "x", "resolvedAt": n}));
        }
        let checked = validate(&valid(json!({"byName": by_name})), None).unwrap();
        let kept = checked.payload["state"]["byName"].as_object().unwrap();
        assert_eq!(kept.len(), MAX_ARTIST_META);
        assert!(!kept.contains_key("artist 0"));
        assert!(kept.contains_key(&format!("artist {MAX_ARTIST_META}")));
    }

    #[test]
    fn history_keeps_the_newest_36_months_and_ranks_tracks_by_ms() {
        let buckets: Vec<Value> = (1..=37).map(|m| json!({"month": format!("2025-{m:02}"), "tracks": {}, "artists": {}, "hours": [], "days": {}})).collect();
        let checked = validate(&valid(json!({"buckets": buckets})), None).unwrap();
        let kept = checked.payload["state"]["buckets"].as_array().unwrap();
        assert_eq!(kept.len(), MAX_HISTORY_MONTHS);
        assert_eq!(kept[0]["month"], json!("2025-02"));
        assert!(checked.sanitized);
    }

    #[test]
    fn out_of_range_settings_are_dropped() {
        let checked = validate(&valid(json!({"crossfadeSeconds": 31, "playbackSpeed": 1.5, "loudnessLevel": "loud", "streamingQuality": "ultra"})), None).unwrap();
        assert_eq!(checked.payload["state"], json!({"playbackSpeed": 1.5, "loudnessLevel": "loud"}));
        assert!(checked.sanitized);
    }
}

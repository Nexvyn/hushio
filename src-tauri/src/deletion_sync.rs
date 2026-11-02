use std::collections::{BTreeMap, HashSet};

use serde_json::{json, Value};

pub const TOMBSTONE_LIMIT: usize = 512;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub type TimeMap = BTreeMap<String, u64>;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct DeletionSync {
    pub clock: u64,
    pub floor: u64,
    pub adds: TimeMap,
    pub deletes: TimeMap,
    pub edits: TimeMap,
    pub clears: TimeMap,
}

pub fn key(group: &str, id: &str, parent: Option<&str>) -> String {
    match parent {
        Some(parent) => json!([group, parent, id]).to_string(),
        None => json!([group, id]).to_string(),
    }
}

pub fn from_value(value: &Value) -> DeletionSync {
    let Some(object) = value.as_object() else {
        return DeletionSync::default();
    };
    if object.get("schema").and_then(Value::as_u64) != Some(1) {
        return DeletionSync::default();
    }
    let mut meta = DeletionSync {
        clock: read_int(object.get("clock")),
        floor: read_int(object.get("floor")),
        adds: read_times(object.get("adds")),
        deletes: read_times(object.get("deletes")),
        edits: read_times(object.get("edits")),
        clears: read_times(object.get("clears")),
    };
    let newest = [&meta.adds, &meta.deletes, &meta.edits, &meta.clears]
        .into_iter()
        .flat_map(|map| map.values().copied())
        .max()
        .unwrap_or(0);
    meta.clock = meta.clock.max(meta.floor).max(newest);
    meta
}

pub fn to_value(meta: &DeletionSync) -> Value {
    json!({
        "schema": 1,
        "clock": meta.clock,
        "floor": meta.floor,
        "adds": meta.adds,
        "deletes": meta.deletes,
        "edits": meta.edits,
        "clears": meta.clears,
    })
}

pub fn join(a: &DeletionSync, b: &DeletionSync) -> DeletionSync {
    DeletionSync {
        clock: a.clock.max(b.clock),
        floor: a.floor.max(b.floor),
        adds: max_maps(&a.adds, &b.adds),
        deletes: max_maps(&a.deletes, &b.deletes),
        edits: max_maps(&a.edits, &b.edits),
        clears: max_maps(&a.clears, &b.clears),
    }
}

pub fn compact(meta: &DeletionSync, live: &HashSet<String>) -> DeletionSync {
    let mut newest: Vec<(&String, u64)> = meta.deletes.iter().map(|(key, time)| (key, *time)).collect();
    newest.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));
    let floor = newest
        .iter()
        .skip(TOMBSTONE_LIMIT)
        .map(|(_, time)| *time)
        .fold(meta.floor, u64::max);
    DeletionSync {
        clock: meta.clock,
        floor,
        adds: keep_live(&meta.adds, live),
        deletes: newest
            .into_iter()
            .filter(|(_, time)| *time > floor)
            .map(|(key, time)| (key.clone(), time))
            .collect(),
        edits: keep_live(&meta.edits, live),
        clears: meta.clears.clone(),
    }
}

pub fn survives(side: &DeletionSync, joined: &DeletionSync, group: &str, item_key: &str) -> bool {
    let added = joined.adds.get(item_key).copied().unwrap_or(0);
    let deleted = joined.deletes.get(item_key).copied().unwrap_or(0);
    let cleared = joined.clears.get(group).copied().unwrap_or(0);
    if added == 0 {
        return deleted == 0 && cleared == 0;
    }
    (side.floor >= joined.floor || added > joined.floor) && added > deleted && added > cleared
}

fn max_maps(a: &TimeMap, b: &TimeMap) -> TimeMap {
    let mut out = a.clone();
    for (key, time) in b {
        let slot = out.entry(key.clone()).or_insert(0);
        *slot = (*slot).max(*time);
    }
    out
}

fn keep_live(map: &TimeMap, live: &HashSet<String>) -> TimeMap {
    map.iter().filter(|(key, _)| live.contains(*key)).map(|(key, time)| (key.clone(), *time)).collect()
}

fn read_int(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).filter(|n| *n <= MAX_SAFE_INTEGER).unwrap_or(0)
}

fn read_times(value: Option<&Value>) -> TimeMap {
    value
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(key, time)| time.as_u64().filter(|n| *n <= MAX_SAFE_INTEGER).map(|n| (key.clone(), n)))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta_with(adds: &[(&str, u64)], deletes: &[(&str, u64)]) -> DeletionSync {
        DeletionSync {
            clock: 1,
            adds: adds.iter().map(|(k, t)| (k.to_string(), *t)).collect(),
            deletes: deletes.iter().map(|(k, t)| (k.to_string(), *t)).collect(),
            ..Default::default()
        }
    }

    fn live(keys: &[&str]) -> HashSet<String> {
        keys.iter().map(|k| k.to_string()).collect()
    }

    #[test]
    fn unknown_schema_reads_as_empty() {
        assert_eq!(from_value(&json!({"schema": 2, "clock": 9})), DeletionSync::default());
        assert_eq!(from_value(&json!(null)), DeletionSync::default());
    }

    #[test]
    fn clock_is_raised_to_the_newest_recorded_time() {
        let meta = from_value(&json!({"schema": 1, "clock": 5, "floor": 40, "adds": {"a": 90}}));
        assert_eq!(meta.clock, 90);
        assert_eq!(meta.floor, 40);
    }

    #[test]
    fn serialized_meta_reads_back_unchanged() {
        let meta = DeletionSync {
            clock: 20,
            ..meta_with(&[(&key("liked", "t1", None), 10)], &[(&key("folders", "f1", None), 20)])
        };
        assert_eq!(from_value(&to_value(&meta)), meta);
    }

    #[test]
    fn join_takes_the_newest_time_per_key_in_either_order() {
        let a = meta_with(&[("x", 5), ("y", 9)], &[("z", 3)]);
        let b = meta_with(&[("x", 7)], &[("z", 4), ("w", 2)]);
        let ab = join(&a, &b);
        assert_eq!(ab, join(&b, &a));
        assert_eq!(ab.adds.get("x"), Some(&7));
        assert_eq!(ab.adds.get("y"), Some(&9));
        assert_eq!(ab.deletes.get("z"), Some(&4));
        assert_eq!(join(&ab, &b), ab);
    }

    #[test]
    fn compact_drops_the_oldest_tombstones_and_raises_the_floor() {
        let deletes: TimeMap = (1..=TOMBSTONE_LIMIT as u64 + 3).map(|t| (format!("k{t}"), t)).collect();
        let meta = DeletionSync { clock: 600, deletes, ..Default::default() };
        let compacted = compact(&meta, &HashSet::new());
        assert_eq!(compacted.deletes.len(), TOMBSTONE_LIMIT);
        assert_eq!(compacted.floor, 3);
        assert!(!compacted.deletes.contains_key("k3"));
        assert_eq!(compacted.deletes.get("k4"), Some(&4));
    }

    #[test]
    fn compact_keeps_adds_and_edits_only_for_live_items() {
        let mut meta = meta_with(&[("kept", 1), ("gone", 2)], &[]);
        meta.edits.insert("kept".into(), 3);
        meta.edits.insert("gone".into(), 4);
        let compacted = compact(&meta, &live(&["kept"]));
        assert_eq!(compacted.adds.keys().collect::<Vec<_>>(), vec!["kept"]);
        assert_eq!(compacted.edits.keys().collect::<Vec<_>>(), vec!["kept"]);
    }

    #[test]
    fn a_newer_delete_removes_and_a_newer_add_restores() {
        let item = key("liked", "t1", None);
        let joined_deleted = join(&meta_with(&[(&item, 5)], &[]), &meta_with(&[], &[(&item, 9)]));
        assert!(!survives(&joined_deleted, &joined_deleted, "liked", &item));
        let joined_readded = join(&meta_with(&[(&item, 12)], &[]), &meta_with(&[], &[(&item, 9)]));
        assert!(survives(&joined_readded, &joined_readded, "liked", &item));
    }

    #[test]
    fn a_delete_at_the_same_time_as_an_add_wins() {
        let item = key("tracks", "t1", Some("p1"));
        let joined = join(&meta_with(&[(&item, 7)], &[]), &meta_with(&[], &[(&item, 7)]));
        assert!(!survives(&joined, &joined, "tracks", &item));
    }

    #[test]
    fn legacy_item_without_an_add_time_survives_only_without_a_delete() {
        let item = key("folders", "f1", None);
        let plain = DeletionSync::default();
        assert!(survives(&plain, &plain, "folders", &item));
        let deleted = meta_with(&[], &[(&item, 4)]);
        assert!(!survives(&deleted, &deleted, "folders", &item));
    }

    #[test]
    fn an_expired_tombstone_does_not_resurrect_an_old_add() {
        let item = key("playlists", "p1", None);
        let compacted_away = DeletionSync { floor: 1000, clock: 1000, ..Default::default() };
        let stale_side = DeletionSync { floor: 0, adds: [(item.clone(), 500)].into(), ..Default::default() };
        let joined = join(&stale_side, &compacted_away);
        assert!(!survives(&stale_side, &joined, "playlists", &item));

        let newer_side = DeletionSync { floor: 0, adds: [(item.clone(), 1500)].into(), ..Default::default() };
        let joined = join(&newer_side, &compacted_away);
        assert!(survives(&newer_side, &joined, "playlists", &item));
    }

    #[test]
    fn a_clear_removes_only_adds_at_or_before_it() {
        let old = key("history", "t1", None);
        let fresh = key("history", "t2", None);
        let base = meta_with(&[(&old, 5), (&fresh, 20)], &[]);
        let cleared = DeletionSync { clock: 10, clears: [("history".to_string(), 10)].into(), ..Default::default() };
        let joined = join(&base, &cleared);
        assert!(!survives(&joined, &joined, "history", &old));
        assert!(survives(&joined, &joined, "history", &fresh));
    }
}

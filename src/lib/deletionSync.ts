export const TOMBSTONE_LIMIT = 512;

export type DeletionGroup =
  | "liked"
  | "playlists"
  | "tracks"
  | "folders"
  | "followedArtists"
  | "history"
  | "searches";

export type DeletionChange =
  | { kind: "add" | "delete" | "edit"; group: DeletionGroup; id: string; parent?: string }
  | { kind: "clear"; group: "history" | "searches" };

type TimeMap = Record<string, number>;

export type DeletionSync = {
  schema: 1;
  clock: number;
  floor: number;
  adds: TimeMap;
  deletes: TimeMap;
  edits: TimeMap;
  clears: TimeMap;
};

export function emptyDeletionSync(): DeletionSync {
  return { schema: 1, clock: 0, floor: 0, adds: {}, deletes: {}, edits: {}, clears: {} };
}

export function deletionKey(group: DeletionGroup, id: string, parent?: string): string {
  return JSON.stringify(parent === undefined ? [group, id] : [group, parent, id]);
}

const LEGACY_TRACK_KEY = /^\["tracks","([^":]*):([^"]*)"\]$/;

export function rekeyPlaylistTracks(meta: DeletionSync): DeletionSync {
  const rekey = (map: TimeMap): TimeMap =>
    Object.fromEntries(
      Object.entries(map).map(([key, time]) => {
        const legacy = LEGACY_TRACK_KEY.exec(key);
        return [legacy ? deletionKey("tracks", legacy[2], legacy[1]) : key, time];
      }),
    );
  return { ...meta, adds: rekey(meta.adds), deletes: rekey(meta.deletes), edits: rekey(meta.edits) };
}

export function recordDeletionChanges(
  meta: DeletionSync,
  changes: readonly DeletionChange[],
  live: ReadonlySet<string>,
  now: number,
): DeletionSync {
  const at = Math.max(now, meta.clock + 1);
  const next: DeletionSync = {
    ...meta,
    clock: at,
    adds: { ...meta.adds },
    deletes: { ...meta.deletes },
    edits: { ...meta.edits },
    clears: { ...meta.clears },
  };
  for (const change of changes) {
    if (change.kind === "clear") {
      next.clears[change.group] = at;
      continue;
    }
    const map = change.kind === "add" ? next.adds : change.kind === "delete" ? next.deletes : next.edits;
    map[deletionKey(change.group, change.id, change.parent)] = at;
  }
  return compactDeletionSync(next, live);
}

function compactDeletionSync(meta: DeletionSync, live: ReadonlySet<string>): DeletionSync {
  const newestFirst = Object.entries(meta.deletes).sort(
    ([keyA, timeA], [keyB, timeB]) => timeB - timeA || keyA.localeCompare(keyB),
  );
  const floor = Math.max(meta.floor, ...newestFirst.slice(TOMBSTONE_LIMIT).map(([, time]) => time));
  return {
    ...meta,
    floor,
    adds: keepLive(meta.adds, live),
    edits: keepLive(meta.edits, live),
    deletes: Object.fromEntries(newestFirst.filter(([, time]) => time > floor)),
  };
}

function keepLive(map: TimeMap, live: ReadonlySet<string>): TimeMap {
  return Object.fromEntries(Object.entries(map).filter(([key]) => live.has(key)));
}

export function readDeletionSync(value: unknown): DeletionSync {
  if (!isRecord(value) || value.schema !== 1) return emptyDeletionSync();
  const meta: DeletionSync = {
    schema: 1,
    clock: readInteger(value.clock),
    floor: readInteger(value.floor),
    adds: readTimes(value.adds),
    deletes: readTimes(value.deletes),
    edits: readTimes(value.edits),
    clears: readTimes(value.clears),
  };
  const times = [meta.adds, meta.deletes, meta.edits, meta.clears].flatMap((map) => Object.values(map));
  return { ...meta, clock: Math.max(meta.clock, meta.floor, ...times) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInteger(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function readTimes(value: unknown): TimeMap {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => Number.isSafeInteger(entry[1])),
  );
}

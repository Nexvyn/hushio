import { persistRead, persistWrite } from "./bridge";
import type { SearchSong } from "./searchParse";

const STORE = "track-matches";
const FOUND_MS = 30 * 24 * 60 * 60 * 1000;
const MISSED_MS = 24 * 60 * 60 * 1000;
export const MAX_REMEMBERED = 5000;
const SAVE_DELAY_MS = 2000;

type Entry = { t: SearchSong | null; at: number };

const entries = new Map<string, Entry>();
let loading: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null || !("at" in value) || typeof value.at !== "number" || !Number.isFinite(value.at) || !("t" in value)) return false;
  const track = value.t;
  return track === null || (typeof track === "object" && "id" in track && typeof track.id === "string" && track.id.length > 0 && "title" in track && typeof track.title === "string" && "artist" in track && typeof track.artist === "string");
}

export function loadMatchCache(): Promise<void> {
  loading ??= persistRead<Record<string, unknown>>(STORE, "guest")
    .then((saved) => {
      for (const [key, entry] of Object.entries(saved ?? {}).slice(-MAX_REMEMBERED)) {
        if (isEntry(entry) && !entries.has(key)) entries.set(key, entry);
      }
    })
    .catch((error: unknown) => {
      console.warn(`[hushio] match cache could not be read: ${String(error)}`);
    });
  return loading;
}

function scheduleSave(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistWrite(STORE, Object.fromEntries(entries), "guest").catch((error: unknown) => {
      console.warn(`[hushio] match cache could not be saved: ${String(error)}`);
    });
  }, SAVE_DELAY_MS);
}

export function readMatch(key: string, now = Date.now()): SearchSong | null | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  const ttl = entry.t ? FOUND_MS : MISSED_MS;
  if (now - entry.at >= ttl) {
    entries.delete(key);
    return undefined;
  }
  return entry.t;
}

export function writeMatch(key: string, track: SearchSong | null, now = Date.now()): void {
  entries.delete(key);
  entries.set(key, { t: track, at: now });
  while (entries.size > MAX_REMEMBERED) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  scheduleSave();
}

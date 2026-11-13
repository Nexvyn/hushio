import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import type { JournalEntry } from "./replay";

export const SMART_LIMIT = 50;
export const NOT_PLAYED_WINDOW_MS = 30 * 86_400_000;
export const PLAY_MIN_SECONDS = 30;
export const SMART_EMPTY_MESSAGE = "Play some songs and they'll show up here.";

export const SMART_IDS = ["most-played", "recently-added", "not-played"] as const;
export type SmartId = (typeof SMART_IDS)[number];

export const SMART_TITLES: Record<SmartId, string> = {
  "most-played": "Most played",
  "recently-added": "Recently added",
  "not-played": "Not played in a while",
};

export type SmartList = { id: SmartId; title: string; tracks: LibraryTrack[] };

export type SmartInput = {
  liked: readonly LibraryTrack[];
  playlists: readonly Playlist[];
  journal: readonly JournalEntry[];
  now: number;
};

export function isSmartId(value: string | null | undefined): value is SmartId {
  return SMART_IDS.some((id) => id === value);
}

function countedPlays(journal: readonly JournalEntry[]): JournalEntry[] {
  return journal.filter((entry) => entry.heard >= PLAY_MIN_SECONDS);
}

function knownTracks(liked: readonly LibraryTrack[], playlists: readonly Playlist[]): Map<string, LibraryTrack> {
  const known = new Map<string, LibraryTrack>();
  for (const track of liked) if (!known.has(track.id)) known.set(track.id, track);
  for (const playlist of playlists) {
    for (const track of playlist.tracks) if (!known.has(track.id)) known.set(track.id, track);
  }
  return known;
}

function fromJournal(track: JournalEntry["track"]): LibraryTrack {
  return { id: track.id, title: track.title, artist: track.artist, thumb: track.thumb, album: null, duration: 0, explicit: false };
}

function mostPlayed({ liked, playlists, journal }: SmartInput): LibraryTrack[] {
  const stats = new Map<string, { plays: number; last: number; track: JournalEntry["track"] }>();
  for (const entry of countedPlays(journal)) {
    const stat = stats.get(entry.track.id);
    if (stat) {
      stat.plays += 1;
      stat.last = Math.max(stat.last, entry.at);
    } else {
      stats.set(entry.track.id, { plays: 1, last: entry.at, track: entry.track });
    }
  }
  const known = knownTracks(liked, playlists);
  return [...stats.entries()]
    .sort(([idA, a], [idB, b]) => b.plays - a.plays || b.last - a.last || idA.localeCompare(idB))
    .slice(0, SMART_LIMIT)
    .map(([id, stat]) => known.get(id) ?? fromJournal(stat.track));
}

function recentlyAdded({ liked }: SmartInput): LibraryTrack[] {
  return liked.slice(0, SMART_LIMIT);
}

function lastPlayedAt(journal: readonly JournalEntry[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const entry of countedPlays(journal)) {
    last.set(entry.track.id, Math.max(last.get(entry.track.id) ?? 0, entry.at));
  }
  return last;
}

function notPlayed({ liked, journal, now }: SmartInput): LibraryTrack[] {
  const last = lastPlayedAt(journal);
  const cutoff = now - NOT_PLAYED_WINDOW_MS;
  return liked
    .filter((track) => (last.get(track.id) ?? 0) < cutoff)
    .sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0));
}

export function smartTracks(id: SmartId, input: SmartInput): LibraryTrack[] {
  if (id === "most-played") return mostPlayed(input);
  if (id === "recently-added") return recentlyAdded(input);
  return notPlayed(input);
}

export function buildSmartLists(input: SmartInput): SmartList[] {
  return SMART_IDS.map((id) => ({ id, title: SMART_TITLES[id], tracks: smartTracks(id, input) }));
}

export function saveAsPlaylist(name: string, tracks: readonly LibraryTrack[]): string {
  const library = useLibrary.getState();
  const id = library.createPlaylist(name);
  for (const track of tracks) library.addToPlaylist(id, track);
  return id;
}

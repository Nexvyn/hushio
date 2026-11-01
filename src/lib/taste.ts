import { daySeed } from "./seeded";
import type { Track } from "../types";

export const DAY_MS = 86_400_000;
const UNKNOWN_ARTIST = "unknown artist";
const LN2 = Math.LN2;
const MIN_HEARD_S = 4;
const FULL_WITHOUT_LENGTH_S = 120;
const LONG_TRACK_S = 30;
const LATELY_HALF_LIFE_MS = 3 * DAY_MS;
const NEGATIVE_HALF_LIFE_MS = 30 * DAY_MS;
const RECENT_MS = 21 * DAY_MS;
const ASSUMED_PLAY_MS = 210_000;
const BACK_TO_BACK_GAP_MS = 30 * 60_000;
const HEAVY_ROTATION = { windowMs: RECENT_MS, halfLifeMs: 5 * DAY_MS, minListens: 2, max: 20 };
const HEAVY_ROTATION_FILL_BELOW = 4;
const HEAVY_ROTATION_FILL_MIN_PLAYS = 3;
const DUST_OFF = { restMs: RECENT_MS, minPlays: 3, max: 20 };
const VIEW_COUNT = /^\d[\d.,]*\s*[kmb]?\s*(views|plays|songs|tracks|subscribers|listeners)$/;
const CREDIT_SPLIT = /,|&|•|\s+x\s+|\bfeat\.?\s|\bft\.?\s/i;
const TRAILING_MORE = /\s+(and|&)\s+more\s*$/i;

export type Outcome = "done" | "part" | "skip";
export type JournalEntry = { track: Track; at: number; heard: number };
export type VotedEntry = JournalEntry & { out: Outcome };
export type Maturity = "cold" | "light" | "warmed" | "strong";

export const VOTE: Record<Outcome, number> = { done: 1, part: 0.5, skip: -1 };

export function isEarlyExit(playedSec: number, durationSec: number): boolean {
  if (playedSec < MIN_HEARD_S) return false;
  if (!(durationSec > LONG_TRACK_S)) return false;
  const exitWindow = Math.min(durationSec * 0.4, 120);
  return playedSec < exitWindow && playedSec < durationSec * 0.9;
}

export function outcomeOf(heardSec: number, durationSec: number): Outcome | null {
  if (heardSec < MIN_HEARD_S) return null;
  if (isEarlyExit(heardSec, durationSec)) return "skip";
  const full = durationSec > LONG_TRACK_S ? heardSec >= durationSec * 0.7 : heardSec >= FULL_WITHOUT_LENGTH_S;
  return full ? "done" : "part";
}

export function fade(ageMs: number, halfLifeMs: number): number {
  return ageMs <= 0 ? 1 : 0.5 ** (ageMs / halfLifeMs);
}

export function fadedCount(entry: { n: number; at: number } | undefined, now: number, halfLifeMs: number): number {
  return entry ? entry.n * fade(now - entry.at, halfLifeMs) : 0;
}

export function artistKeyOf(name: string): string {
  return name.trim().toLowerCase();
}

function isUsableKey(key: string): boolean {
  return key !== "" && key !== UNKNOWN_ARTIST;
}

export function votesOf(entries: readonly JournalEntry[], durations: Readonly<Record<string, number>>): VotedEntry[] {
  return entries.flatMap((entry) => {
    const out = outcomeOf(entry.heard, durations[entry.track.id] ?? 0);
    return out === null ? [] : [{ ...entry, out }];
  });
}

export function latelyByArtist(entries: readonly VotedEntry[], now: number, halfLifeMs = LATELY_HALF_LIFE_MS): Map<string, number> {
  const scores = new Map<string, number>();
  for (const entry of entries) {
    const key = artistKeyOf(entry.track.artist);
    if (!isUsableKey(key)) continue;
    scores.set(key, (scores.get(key) ?? 0) + VOTE[entry.out] * fade(now - entry.at, halfLifeMs));
  }
  return scores;
}

export type HeavyRow = { track: Track; listens: number; score: number };

export function heavyRotation(
  entries: readonly VotedEntry[],
  now: number,
  { windowMs, halfLifeMs, minListens, max }: typeof HEAVY_ROTATION = HEAVY_ROTATION,
): HeavyRow[] {
  const groups = new Map<string, HeavyRow & { latest: number }>();
  for (const entry of entries) {
    if (now - entry.at > windowMs) continue;
    const group = groups.get(entry.track.id) ?? { track: entry.track, listens: 0, score: 0, latest: Number.NEGATIVE_INFINITY };
    if (entry.out !== "skip") group.listens += 1;
    group.score += VOTE[entry.out] * fade(now - entry.at, halfLifeMs);
    if (entry.at >= group.latest) {
      group.latest = entry.at;
      group.track = entry.track;
    }
    groups.set(entry.track.id, group);
  }
  return [...groups.values()]
    .filter((row) => row.listens >= minListens && row.score > 0)
    .sort((a, b) => b.score - a.score || b.listens - a.listens)
    .slice(0, max)
    .map(({ track, listens, score }) => ({ track, listens, score }));
}

export type DustRow = { track: Track; plays: number; lastAt: number };

export function dustOff(
  tracks: readonly DustRow[],
  { played, skipped }: { played: ReadonlySet<string>; skipped: ReadonlySet<string> },
  now: number,
  { restMs, minPlays, max } = DUST_OFF,
): DustRow[] {
  return tracks
    .filter(
      (row) =>
        row.plays >= minPlays &&
        now - row.lastAt >= restMs &&
        !played.has(row.track.id) &&
        !skipped.has(row.track.id),
    )
    .sort((a, b) => b.plays - a.plays || b.lastAt - a.lastAt)
    .slice(0, max);
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function backToBack(entries: readonly VotedEntry[], gapMs = BACK_TO_BACK_GAP_MS): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  const counts = new Map<string, number>();
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (a.out === "skip" || b.out === "skip") continue;
    if (b.at - a.at > gapMs) continue;
    const ka = artistKeyOf(a.track.artist);
    const kb = artistKeyOf(b.track.artist);
    if (!ka || !kb || ka === kb || !isUsableKey(ka) || !isUsableKey(kb)) continue;
    const key = pairKey(ka, kb);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function artistsInLine(line: string): string[] {
  return line
    .replace(TRAILING_MORE, "")
    .split(CREDIT_SPLIT)
    .map(artistKeyOf)
    .filter((key) => isUsableKey(key) && !VIEW_COUNT.test(key));
}

export function rankByTaste<T extends { subtitle?: string }>(items: readonly T[], affinity: ReadonlyMap<string, number>): T[] {
  if (affinity.size === 0) return [...items];
  return items
    .map((item, index) => {
      const match = artistsInLine(item.subtitle ?? "").reduce((sum, key) => sum + (affinity.get(key) ?? 0), 0);
      return { item, match, index };
    })
    .sort((a, b) => b.match - a.match || a.index - b.index)
    .map((entry) => entry.item);
}

export type StatsTrack = { id: string; title: string; artist: string; thumb: string | null; ms: number; plays: number; lastAt?: number };
export type StatsArtist = { name: string; ms: number; plays: number };
export type StatsSummary = { plays: number; artists: StatsArtist[]; tracks: StatsTrack[]; hours: number[] };
export type ArtistIdentity = { artistId: string; thumb: string | null };
export type SkipTally = { count: number; updatedAt: number };
export type HiddenTally = { n: number; at: number };

export type ProfileInput = {
  all: StatsSummary;
  month: StatsSummary;
  history: Track[];
  liked: Track[];
  playlists: Track[];
  searches: string[];
  skips: Record<string, SkipTally>;
  followed: { id: string; name: string; thumb?: string }[];
  journal: JournalEntry[];
  hiddenArtists: Record<string, HiddenTally>;
  durations: Record<string, number>;
  now: number;
  resolveArtist: (name: string) => ArtistIdentity | null;
};

export type ArtistScore = {
  key: string;
  name: string;
  artistId: string | null;
  thumb: string | null;
  score: number;
  lately: number;
  lastPlayedAt: number | null;
};

export type TasteProfile = {
  daySeed: number;
  totalPlays: number;
  maturity: Maturity;
  artists: ArtistScore[];
  lately: ArtistScore[];
  heavyRotation: HeavyRow[];
  dustOff: DustRow[];
  pairs: Map<string, number>;
  topTracks: StatsTrack[];
  playedTrackIds: Set<string>;
  recentlyPlayed: Track[];
  liked: Track[];
  searches: string[];
  hours: number[];
  hourEnergy: number;
};

type Aggregate = {
  key: string;
  name: string;
  artistId: string | null;
  thumb: string | null;
  msMonth: number;
  msAll: number;
  playsMonth: number;
  playsAll: number;
  likedCount: number;
  searchHits: number;
  lastPlayedAt: number | null;
};

export function maturityOf(totalPlays: number): Maturity {
  if (totalPlays < 1) return "cold";
  if (totalPlays < 25) return "light";
  if (totalPlays < 100) return "warmed";
  return "strong";
}

function trackOf(track: StatsTrack | Track): Track {
  return { id: track.id, title: track.title, artist: track.artist, thumb: track.thumb };
}

function durationMs(track: Track, durations: Readonly<Record<string, number>>): number {
  const seconds = durations[track.id] ?? 0;
  return seconds > 0 ? seconds * 1000 : ASSUMED_PLAY_MS;
}

function newAggregate(key: string, name: string): Aggregate {
  return {
    key,
    name: name.trim() || "Unknown artist",
    artistId: null,
    thumb: null,
    msMonth: 0,
    msAll: 0,
    playsMonth: 0,
    playsAll: 0,
    likedCount: 0,
    searchHits: 0,
    lastPlayedAt: null,
  };
}

export function computeTasteProfile(input: ProfileInput): TasteProfile {
  const { all, month, now, durations } = input;
  const votes = votesOf(input.journal, durations);
  const lately = latelyByArtist(votes, now);
  const maxLately = Math.max(0, ...lately.values());

  const aggregates = new Map<string, Aggregate>();
  const aggregateFor = (name: string): Aggregate => {
    const key = artistKeyOf(name) || UNKNOWN_ARTIST;
    const existing = aggregates.get(key);
    if (existing) return existing;
    const created = newAggregate(key, name);
    aggregates.set(key, created);
    return created;
  };

  for (const artist of month.artists) {
    const agg = aggregateFor(artist.name);
    agg.msMonth = artist.ms;
    agg.playsMonth = artist.plays;
  }
  for (const artist of all.artists) {
    const agg = aggregateFor(artist.name);
    agg.msAll = artist.ms;
    agg.playsAll = artist.plays;
  }
  const statsKeys = new Set([...all.artists, ...month.artists].map((artist) => artistKeyOf(artist.name)));

  let libraryPlays = 0;
  let libraryLikes = 0;
  for (const track of input.history) {
    const key = artistKeyOf(track.artist);
    if (statsKeys.has(key)) continue;
    libraryPlays += 1;
    const agg = aggregateFor(track.artist);
    agg.playsAll += 1;
    agg.msAll += durationMs(track, durations);
  }
  for (const track of input.liked) {
    const key = artistKeyOf(track.artist);
    if (statsKeys.has(key)) continue;
    libraryLikes += 1;
    aggregateFor(track.artist);
  }

  for (const track of input.liked) {
    aggregateFor(track.artist).likedCount += 1;
  }
  for (const entry of input.followed) {
    const agg = aggregateFor(entry.name);
    agg.likedCount += 2;
    agg.artistId = entry.id;
    agg.thumb = entry.thumb ?? null;
  }
  for (const agg of aggregates.values()) {
    if (agg.artistId !== null) continue;
    const identity = input.resolveArtist(agg.name);
    if (!identity) continue;
    agg.artistId = identity.artistId;
    agg.thumb = identity.thumb;
  }

  for (const entry of input.journal) {
    const agg = aggregates.get(artistKeyOf(entry.track.artist));
    if (agg && (agg.lastPlayedAt === null || entry.at > agg.lastPlayedAt)) agg.lastPlayedAt = entry.at;
  }
  for (const track of [...month.tracks, ...all.tracks]) {
    const agg = aggregates.get(artistKeyOf(track.artist));
    if (agg && track.lastAt !== undefined && (agg.lastPlayedAt === null || track.lastAt > agg.lastPlayedAt)) {
      agg.lastPlayedAt = track.lastAt;
    }
  }

  for (const raw of input.searches) {
    const query = raw.trim().toLowerCase();
    if (!query) continue;
    for (const agg of aggregates.values()) {
      if (agg.key.includes(query) || query.includes(agg.key)) agg.searchHits += 1;
    }
  }

  const allAggregates = Array.from(aggregates.values());
  const maxMsMonth = Math.max(1, ...month.artists.map((artist) => artist.ms), ...allAggregates.map((agg) => agg.msMonth));
  const maxMsAll = Math.max(1, ...all.artists.map((artist) => artist.ms), ...allAggregates.map((agg) => agg.msAll));

  const scored: ArtistScore[] = [];
  for (const agg of aggregates.values()) {
    if (agg.key === UNKNOWN_ARTIST) continue;
    if (agg.playsMonth + agg.playsAll + agg.likedCount === 0) continue;
    const ageDays = agg.lastPlayedAt === null ? null : (now - agg.lastPlayedAt) / DAY_MS;
    const recency = ageDays === null ? 0.4 : Math.exp((-ageDays / 5) * LN2);
    const vote = lately.get(agg.key) ?? 0;
    const monthTrend = (agg.msMonth / maxMsMonth) * (0.35 + 0.65 * recency);
    const trend = maxLately > 0 ? 0.5 * monthTrend + 0.5 * (Math.max(0, vote) / maxLately) : monthTrend;
    const longterm = agg.msAll / maxMsAll;
    const likedBoost = Math.min(12, agg.likedCount * 6);
    const searchBoost = Math.min(8, agg.searchHits * 4);
    const skip = input.skips[agg.key];
    const skipsNow = skip ? skip.count * fade(now - skip.updatedAt, NEGATIVE_HALF_LIFE_MS) : 0;
    const skipPenalty = Math.min(35, skipsNow * 9) + (vote < 0 ? Math.min(15, -vote * 5) : 0);
    const hidePenalty = Math.min(30, fadedCount(input.hiddenArtists[agg.key], now, NEGATIVE_HALF_LIFE_MS) * 12);
    const score = 60 * trend + 30 * longterm + likedBoost + searchBoost - skipPenalty - hidePenalty;
    scored.push({
      key: agg.key,
      name: agg.name,
      artistId: agg.artistId,
      thumb: agg.thumb,
      score,
      lately: vote,
      lastPlayedAt: agg.lastPlayedAt,
    });
  }
  const artists = scored.sort((a, b) => b.score - a.score);
  const latelyArtists = artists.filter((artist) => artist.lately > 0).sort((a, b) => b.lately - a.lately);

  const known = new Map<string, Track>();
  for (const track of [...input.playlists, ...input.liked, ...input.history, ...votes.map((entry) => entry.track)]) {
    known.set(track.id, track);
  }
  const songOf = (track: StatsTrack | Track): Track => known.get(track.id) ?? trackOf(track);

  const journalIds = new Set(votes.map((entry) => entry.track.id));
  const playedTrackIds = new Set<string>([
    ...month.tracks.map((track) => track.id),
    ...input.history.map((track) => track.id),
    ...input.liked.map((track) => track.id),
    ...votes.filter((entry) => entry.out !== "skip").map((entry) => entry.track.id),
  ]);

  const recentVotes = votes.filter((entry) => now - entry.at <= RECENT_MS);
  let heavy = heavyRotation(votes, now);
  if (heavy.length < HEAVY_ROTATION_FILL_BELOW) {
    const fill = month.tracks
      .filter((track) => track.plays >= HEAVY_ROTATION_FILL_MIN_PLAYS && !journalIds.has(track.id))
      .sort((a, b) => b.plays - a.plays)
      .map((track) => ({ track: songOf(track), listens: track.plays, score: 0 }));
    heavy = [...heavy, ...fill].slice(0, HEAVY_ROTATION.max);
  }

  const latestAt = new Map<string, number>();
  for (const entry of input.journal) {
    latestAt.set(entry.track.id, Math.max(latestAt.get(entry.track.id) ?? 0, entry.at));
  }
  const dustRows: DustRow[] = [];
  for (const track of all.tracks) {
    const lastAt = latestAt.get(track.id) ?? track.lastAt;
    if (lastAt === undefined) continue;
    dustRows.push({ track: songOf(track), plays: track.plays, lastAt });
  }
  const dust = dustOff(
    dustRows,
    {
      played: new Set(recentVotes.filter((entry) => entry.out !== "skip").map((entry) => entry.track.id)),
      skipped: new Set(recentVotes.filter((entry) => entry.out === "skip").map((entry) => entry.track.id)),
    },
    now,
  );

  const hours = month.hours.length === 24 ? month.hours : new Array<number>(24).fill(0);
  const peakHour = Math.max(1, ...hours);
  const totalPlays = all.plays + libraryPlays + libraryLikes;

  return {
    daySeed: daySeed(now),
    totalPlays,
    maturity: maturityOf(totalPlays),
    artists,
    lately: latelyArtists,
    heavyRotation: heavy,
    dustOff: dust,
    pairs: backToBack(votes),
    topTracks: month.tracks,
    playedTrackIds,
    recentlyPlayed: input.history,
    liked: input.liked,
    searches: input.searches,
    hours,
    hourEnergy: hours[new Date(now).getHours()] / peakHour,
  };
}

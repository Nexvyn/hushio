import { artistKeyOf, DAY_MS, fadedCount, type HiddenTally } from "./taste";

export const TAP_HALF_LIFE_MS = 10 * DAY_MS;
export const HIDE_FOR_MS = 180 * DAY_MS;
export const ARTIST_HIDE_HALF_LIFE_MS = 30 * DAY_MS;
export const MAX_HIDDEN = 500;
const BOOST_CAP = 10;
const BOOST_SCALE = 2;

export type Tap = { n: number; at: number };

export type Engagement = {
  taps: Record<string, Tap>;
  hiddenTracks: Record<string, number>;
  hiddenArtists: Record<string, HiddenTally>;
};

export function recordTap(taps: Record<string, Tap>, kind: string, now: number): Record<string, Tap> {
  return { ...taps, [kind]: { n: fadedCount(taps[kind], now, TAP_HALF_LIFE_MS) + 1, at: now } };
}

export function tapsNow(taps: Record<string, Tap>, now: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(taps).map(([kind, tap]) => [kind, fadedCount(tap, now, TAP_HALF_LIFE_MS)]),
  );
}

export function learnedBoost(taps: number): number {
  return BOOST_CAP * (1 - Math.exp(-taps / BOOST_SCALE));
}

export function hiddenNow(hiddenTracks: Record<string, number>, now: number): Set<string> {
  return new Set(Object.entries(hiddenTracks).filter(([, at]) => now - at < HIDE_FOR_MS).map(([id]) => id));
}

export function hideSong(state: Engagement, track: { id: string; artist: string }, now: number): Engagement {
  const hiddenTracks = Object.fromEntries(
    [[track.id, now] as const, ...Object.entries(state.hiddenTracks)]
      .filter(([, at]) => now - at < HIDE_FOR_MS)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_HIDDEN),
  );
  const key = artistKeyOf(track.artist);
  const hiddenArtists = {
    ...state.hiddenArtists,
    [key]: { n: fadedCount(state.hiddenArtists[key], now, ARTIST_HIDE_HALF_LIFE_MS) + 1, at: now },
  };
  return { taps: state.taps, hiddenTracks, hiddenArtists };
}

import { describe, expect, it } from "vitest";
import {
  ARTIST_HIDE_HALF_LIFE_MS,
  type Engagement,
  HIDE_FOR_MS,
  hiddenNow,
  hideSong,
  learnedBoost,
  MAX_HIDDEN,
  recordTap,
  TAP_HALF_LIFE_MS,
  tapsNow,
} from "./engagement";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9, 12);

const empty: Engagement = { taps: {}, hiddenTracks: {}, hiddenArtists: {} };

describe("recordTap", () => {
  it("adds one to a row's faded tap count and stamps the time", () => {
    const once = recordTap({}, "favorite-artists", NOW);
    const twice = recordTap(once, "favorite-artists", NOW + DAY);

    expect(once["favorite-artists"]).toEqual({ n: 1, at: NOW });
    expect(twice["favorite-artists"].n).toBeCloseTo(1 + 0.5 ** (DAY / TAP_HALF_LIFE_MS), 6);
    expect(twice["favorite-artists"].at).toBe(NOW + DAY);
  });

  it("reads the faded count per kind", () => {
    const taps = { market: { n: 4, at: NOW - TAP_HALF_LIFE_MS } };

    expect(tapsNow(taps, NOW)).toEqual({ market: 2 });
  });
});

describe("learnedBoost", () => {
  it("rises from zero toward ten as taps grow", () => {
    expect(learnedBoost(0)).toBe(0);
    expect(learnedBoost(2)).toBeCloseTo(10 * (1 - Math.exp(-1)), 6);
    expect(learnedBoost(20)).toBeCloseTo(10, 2);
  });
});

describe("hideSong", () => {
  it("hides a song for 180 days and an artist with a 30-day count", () => {
    const state = hideSong(empty, { id: "v1", artist: "Alpha" }, NOW);

    expect(hiddenNow(state.hiddenTracks, NOW).has("v1")).toBe(true);
    expect(state.hiddenArtists.alpha).toEqual({ n: 1, at: NOW });

    const later = hideSong(state, { id: "v2", artist: "alpha " }, NOW + ARTIST_HIDE_HALF_LIFE_MS);
    expect(later.hiddenArtists.alpha.n).toBeCloseTo(1 + 0.5, 6);
  });

  it("drops songs that have expired and keeps only the newest 500", () => {
    const filled = Array.from({ length: MAX_HIDDEN }, (_, index) => [`t${index}`, NOW - index * 1000] as const);
    const state: Engagement = {
      ...empty,
      hiddenTracks: { expired: NOW - HIDE_FOR_MS - DAY, ...Object.fromEntries(filled) },
    };

    const next = hideSong(state, { id: "newest", artist: "A" }, NOW + 1);
    const keys = Object.keys(next.hiddenTracks);

    expect(keys).toHaveLength(MAX_HIDDEN);
    expect(keys).toContain("newest");
    expect(keys).not.toContain("expired");
    expect(keys).not.toContain(`t${MAX_HIDDEN - 1}`);
  });

  it("leaves hidden songs out once they pass the 180-day window", () => {
    expect(hiddenNow({ a: NOW - HIDE_FOR_MS + DAY, b: NOW - HIDE_FOR_MS - DAY }, NOW)).toEqual(new Set(["a"]));
  });
});

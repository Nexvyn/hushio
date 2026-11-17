import { describe, expect, it } from "vitest";
import {
  hasRecommendationAhead,
  RECOMMEND_EVERY,
  shuffleModeOf,
  userTracks,
  withoutUpcomingRecommendations,
  withRecommendation,
} from "./smartShuffle";
import type { Track } from "../types";

const song = (n: number, extra: Partial<Track> = {}): Track => ({ id: `s${n}`, title: `Song ${n}`, artist: "Artist", thumb: null, ...extra });
const rec = (n: number) => song(n, { recommended: true });
const ids = (tracks: readonly Track[]) => tracks.map((track) => track.id);

describe("withRecommendation", () => {
  it("inserts the pick after three upcoming songs and marks it", () => {
    const queue = [song(0), song(1), song(2), song(3), song(4), song(5)];
    const next = withRecommendation(queue, 0, song(90));
    expect(ids(next)).toEqual(["s0", "s1", "s2", "s3", "s90", "s4", "s5"]);
    expect(next[4].recommended).toBe(true);
    expect(queue[4].recommended).toBeUndefined();
  });

  it("appends when fewer upcoming songs remain than the gap", () => {
    const queue = [song(0), song(1)];
    expect(ids(withRecommendation(queue, 0, song(90)))).toEqual(["s0", "s1", "s90"]);
  });
});

describe("hasRecommendationAhead", () => {
  it("is true only when a pick sits inside the next gap", () => {
    const queue = [song(0), song(1), song(2), song(3), rec(9)];
    expect(hasRecommendationAhead(queue, 0)).toBe(false);
    expect(hasRecommendationAhead(queue, 1)).toBe(true);
    expect(RECOMMEND_EVERY).toBe(3);
  });
});

describe("withoutUpcomingRecommendations", () => {
  it("drops picks after the current song and keeps the current one", () => {
    const queue = [rec(7), song(1), rec(9), song(2)];
    expect(ids(withoutUpcomingRecommendations(queue, 0))).toEqual(["s7", "s1", "s2"]);
  });
});

describe("userTracks", () => {
  it("leaves out recommended songs", () => {
    expect(ids(userTracks([song(1), rec(2), song(3)]))).toEqual(["s1", "s3"]);
  });
});

describe("shuffleModeOf", () => {
  it("reports off, shuffle or smart", () => {
    expect(shuffleModeOf({ shuffle: false, smartShuffle: false })).toBe("off");
    expect(shuffleModeOf({ shuffle: true, smartShuffle: false })).toBe("shuffle");
    expect(shuffleModeOf({ shuffle: true, smartShuffle: true })).toBe("smart");
  });
});

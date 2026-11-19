import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../types";
import { cachedRecommendations, loadRecommendations, RECOMMEND_LIMIT, recommendationSeeds, resetRecommendationCache, storeRecommendations } from "./playlistRecommend";
import { fetchSuggestions } from "./autoplay";

vi.mock("./autoplay", async () => {
  const actual = await vi.importActual<typeof import("./autoplay")>("./autoplay");
  return { ...actual, fetchSuggestions: vi.fn(async () => []) };
});

const song = (id: string): Track => ({ id, title: id, artist: "Artist", thumb: null });
const tracks = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd"].map(song);

beforeEach(() => {
  vi.mocked(fetchSuggestions).mockClear();
  resetRecommendationCache();
});

describe("recommendationSeeds", () => {
  it("returns up to three distinct seeds from the playlist", () => {
    const seeds = recommendationSeeds(tracks);
    expect(seeds).toHaveLength(3);
    expect(new Set(seeds).size).toBe(3);
    seeds.forEach((id) => expect(tracks.map((track) => track.id)).toContain(id));
  });

  it("returns no seeds for an empty playlist", () => {
    expect(recommendationSeeds([])).toEqual([]);
  });

  it("moves to other tracks on a later round", () => {
    expect(recommendationSeeds(tracks, 1)).not.toEqual(recommendationSeeds(tracks, 0));
  });
});

describe("loadRecommendations", () => {
  it("seeds from the playlist and excludes its songs and the rows already shown", async () => {
    const shown = [song("zzzzzzzzzzz")];
    await loadRecommendations(tracks, shown, 0);
    const [seeds, exclusions, limit] = vi.mocked(fetchSuggestions).mock.calls[0];
    expect(seeds).toEqual(recommendationSeeds(tracks, 0));
    expect(limit).toBe(RECOMMEND_LIMIT);
    expect(exclusions.excludeIds.has("aaaaaaaaaaa")).toBe(true);
    expect(exclusions.excludeIds.has("zzzzzzzzzzz")).toBe(true);
  });
});

describe("session cache", () => {
  it("keeps rows per playlist until reset", () => {
    storeRecommendations("pl-1", [song("aaaaaaaaaaa")]);
    expect(cachedRecommendations("pl-1")).toHaveLength(1);
    expect(cachedRecommendations("pl-2")).toBeUndefined();
    resetRecommendationCache();
    expect(cachedRecommendations("pl-1")).toBeUndefined();
  });
});

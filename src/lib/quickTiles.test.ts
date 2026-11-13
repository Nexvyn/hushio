import { describe, expect, it } from "vitest";
import { quickTilesFrom, sameSongRow } from "./quickTiles";
import type { RecentItem } from "../stores/recents";
import type { Track } from "../types";

const song = (id: string): Track => ({ id, title: `Title ${id}`, artist: "Artist", thumb: null });
const recent = (id: string): RecentItem => ({ kind: "song", id, title: `Title ${id}`, subtitle: "Artist", thumb: null });

describe("quickTilesFrom", () => {
  it("uses the recent list when it has items", () => {
    const tiles = quickTilesFrom([recent("r1"), recent("r2")], [song("j1")], 6);
    expect(tiles.map((item) => item.id)).toEqual(["r1", "r2"]);
  });

  it("falls back to the jump back in tracks when the recent list is empty", () => {
    const tiles = quickTilesFrom([], [song("j1"), song("j2")], 6);
    expect(tiles).toEqual([
      { kind: "song", id: "j1", title: "Title j1", subtitle: "Artist", thumb: null },
      { kind: "song", id: "j2", title: "Title j2", subtitle: "Artist", thumb: null },
    ]);
  });

  it("never returns more than the limit", () => {
    const jump = Array.from({ length: 9 }, (_, i) => song(`j${i}`));
    expect(quickTilesFrom([], jump, 6)).toHaveLength(6);
    expect(quickTilesFrom(jump.map((track) => recent(track.id)), [], 6)).toHaveLength(6);
  });
});

describe("sameSongRow", () => {
  it("is true when the tiles are the same songs in the same order", () => {
    const tiles = quickTilesFrom([], [song("a"), song("b")], 6);
    expect(sameSongRow(tiles, [song("a"), song("b")])).toBe(true);
  });

  it("is false when the order or the songs differ", () => {
    const tiles = quickTilesFrom([recent("a"), recent("b")], [], 6);
    expect(sameSongRow(tiles, [song("b"), song("a")])).toBe(false);
    expect(sameSongRow(tiles, [song("a")])).toBe(false);
  });

  it("is false when there are no tiles", () => {
    expect(sameSongRow([], [])).toBe(false);
  });
});

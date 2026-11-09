import { describe, expect, it } from "vitest";
import { HERO_COVER_LIMIT, distinctCovers } from "./heroCovers";

describe("distinctCovers", () => {
  it("returns nothing when there are no sources or only empty ones", () => {
    expect(distinctCovers([])).toEqual([]);
    expect(distinctCovers([[], []])).toEqual([]);
  });

  it("returns a single cover unchanged", () => {
    expect(distinctCovers([["a"]])).toEqual(["a"]);
  });

  it("returns two covers in order", () => {
    expect(distinctCovers([["a", "b"]])).toEqual(["a", "b"]);
  });

  it("drops duplicate covers, keeping the first occurrence", () => {
    expect(distinctCovers([["a", "a", "b", "a", "c", "b"]])).toEqual(["a", "b", "c"]);
  });

  it("skips empty and missing covers", () => {
    expect(distinctCovers([["", null, undefined, "a"]])).toEqual(["a"]);
  });

  it("interleaves sources so one long list does not hide the others", () => {
    const liked = ["l1", "l2", "l3", "l4"];
    const playlists = ["p1", "p2"];
    const recents = ["r1"];
    expect(distinctCovers([liked, playlists, recents])).toEqual(["l1", "p1", "r1", "l2", "p2", "l3", "l4"]);
  });

  it("does not repeat a cover that appears in several sources", () => {
    expect(distinctCovers([["x", "y"], ["y", "x", "z"]])).toEqual(["x", "y", "z"]);
  });

  it("caps the result at the default limit", () => {
    const many = Array.from({ length: 30 }, (_, index) => `c${index}`);
    expect(distinctCovers([many])).toHaveLength(HERO_COVER_LIMIT);
  });

  it("honours an explicit limit", () => {
    expect(distinctCovers([["a", "b", "c", "d"]], 2)).toEqual(["a", "b"]);
    expect(distinctCovers([["a", "b"]], 0)).toEqual([]);
  });
});

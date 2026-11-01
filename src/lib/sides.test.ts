import { describe, expect, it } from "vitest";
import { clusterSides, MAX_SIDES, type SideArtist, tieWeight } from "./sides";
import { pairKey } from "./taste";

const artist = (key: string, score: number, artistId: string | null = key): SideArtist => ({
  key,
  name: key.toUpperCase(),
  artistId,
  score,
});

const relatedFrom = (links: Record<string, string[]>) => (artistId: string) => links[artistId] ?? [];

describe("tieWeight", () => {
  it("gives full weight to artists that are related in the catalogue", () => {
    const related = relatedFrom({ a: ["b"] });

    expect(tieWeight(artist("a", 1), artist("b", 1), related, new Map())).toBe(1);
    expect(tieWeight(artist("b", 1), artist("a", 1), related, new Map())).toBe(1);
  });

  it("counts back-to-back listening at a third per listen, capped at one", () => {
    const pairs = new Map([[pairKey("a", "c"), 1]]);
    const related = relatedFrom({});

    expect(tieWeight(artist("a", 1), artist("c", 1), related, pairs)).toBeCloseTo(1 / 3, 6);
    expect(tieWeight(artist("a", 1), artist("c", 1), related, new Map([[pairKey("a", "c"), 9]]))).toBe(1);
  });

  it("gives no weight to artists without ids that have never been heard together", () => {
    expect(tieWeight(artist("a", 1, null), artist("d", 1, null), relatedFrom({}), new Map())).toBe(0);
  });
});

describe("clusterSides", () => {
  it("groups related artists into one side and leaves lone artists out", () => {
    const sides = clusterSides(
      [artist("a", 10), artist("b", 8), artist("c", 5), artist("d", 4, null)],
      relatedFrom({ a: ["b"], b: ["a"] }),
      new Map(),
    );

    expect(sides).toHaveLength(1);
    expect(sides[0].members.map((member) => member.key)).toEqual(["a", "b"]);
    expect(sides[0].total).toBe(18);
  });

  it("merges when one back-to-back listen is enough to reach the merge threshold", () => {
    const sides = clusterSides([artist("x", 3), artist("y", 2)], relatedFrom({}), new Map([[pairKey("x", "y"), 1]]));

    expect(sides.map((side) => side.members.map((member) => member.key))).toEqual([["x", "y"]]);
  });

  it("keeps at most four sides, ordered by total score", () => {
    const pairs = Array.from({ length: 5 }, (_, index) => index);
    const artists = pairs.flatMap((index) => [artist(`p${index}a`, 10 - index), artist(`p${index}b`, 10 - index)]);
    const links: Record<string, string[]> = {};
    for (const index of pairs) {
      links[`p${index}a`] = [`p${index}b`];
      links[`p${index}b`] = [`p${index}a`];
    }

    const sides = clusterSides(artists, relatedFrom(links), new Map());

    expect(sides).toHaveLength(MAX_SIDES);
    expect(sides.map((side) => side.total)).toEqual([20, 18, 16, 14]);
    expect(sides.every((side) => side.members[0].score >= side.members[1].score)).toBe(true);
  });
});

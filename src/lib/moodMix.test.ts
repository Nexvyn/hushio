import { describe, expect, it } from "vitest";
import { buildMix, MIX_SIZE } from "./moodMix";

function tracks(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index}` }));
}

describe("buildMix", () => {
  it("takes one track from each source in turn", () => {
    const mix = buildMix([tracks("a", 3), tracks("b", 2), tracks("c", 3)]);
    expect(mix.map((track) => track.id)).toEqual(["a0", "b0", "c0", "a1", "b1", "c1", "a2", "c2"]);
  });

  it("keeps the first copy of a track that appears in several sources", () => {
    const mix = buildMix([[{ id: "x" }, { id: "y" }], [{ id: "y" }, { id: "z" }]]);
    expect(mix.map((track) => track.id)).toEqual(["x", "y", "z"]);
  });

  it("stops at the size limit", () => {
    const mix = buildMix([tracks("a", 40), tracks("b", 40)], 25);
    expect(mix).toHaveLength(25);
    expect(mix.at(-1)?.id).toBe("a12");
  });

  it("caps the default mix at MIX_SIZE", () => {
    expect(buildMix([tracks("a", 80), tracks("b", 80)])).toHaveLength(MIX_SIZE);
  });

  it("returns nothing when there are no sources or they are empty", () => {
    expect(buildMix([])).toEqual([]);
    expect(buildMix([[], []])).toEqual([]);
  });
});

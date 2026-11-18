import { describe, expect, it } from "vitest";
import { playedFraction } from "./playbackProgress";

describe("playedFraction", () => {
  it("maps position over length", () => {
    expect(playedFraction(30, 200)).toBeCloseTo(0.15);
  });

  it("clamps to the track", () => {
    expect(playedFraction(260, 200)).toBe(1);
    expect(playedFraction(-4, 200)).toBe(0);
  });

  it("is empty when the length is unknown", () => {
    expect(playedFraction(30, 0)).toBe(0);
    expect(playedFraction(30, Number.NaN)).toBe(0);
    expect(playedFraction(Number.NaN, 200)).toBe(0);
  });
});

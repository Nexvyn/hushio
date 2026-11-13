import { describe, expect, it } from "vitest";
import { shownDuration } from "./trackLength";
import type { Track } from "../types";

const song = (duration?: number): Track => ({ id: "a", title: "A", artist: "B", thumb: null, duration });

describe("shownDuration", () => {
  it("uses the player duration when it is known", () => {
    expect(shownDuration(212, song(200))).toBe(212);
  });

  it("falls back to the track length when the player has none yet", () => {
    expect(shownDuration(0, song(200))).toBe(200);
  });

  it("shows nothing when neither length is known", () => {
    expect(shownDuration(0, song())).toBe(0);
    expect(shownDuration(0, song(0))).toBe(0);
    expect(shownDuration(0, null)).toBe(0);
  });

  it("ignores a track length that is not a finite number", () => {
    expect(shownDuration(0, song(Number.NaN))).toBe(0);
  });
});

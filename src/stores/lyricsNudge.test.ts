import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => storage.value,
    setItem: async (_name: string, value: unknown) => {
      storage.value = value;
    },
    removeItem: async () => {
      storage.value = null;
    },
  }),
}));

import {
  clampNudge,
  describeLyricsShift,
  LYRICS_NUDGE_STEP,
  NUDGE_KEEP,
  NUDGE_LIMIT_SEC,
  useLyricsNudge,
} from "./lyricsNudge";

describe("lyrics nudge store", () => {
  beforeEach(() => {
    useLyricsNudge.setState({ nudges: {} });
  });

  it("moves one step earlier or later per call", () => {
    const { nudge } = useLyricsNudge.getState();
    nudge("a", -LYRICS_NUDGE_STEP);
    expect(useLyricsNudge.getState().nudges.a).toBe(-0.25);
    nudge("a", LYRICS_NUDGE_STEP * 3);
    expect(useLyricsNudge.getState().nudges.a).toBe(0.5);
  });

  it("drops the entry when the nudge returns to zero", () => {
    const { nudge } = useLyricsNudge.getState();
    nudge("a", 0.25);
    nudge("a", -0.25);
    expect(useLyricsNudge.getState().nudges).toEqual({});
  });

  it("limits the nudge to ten seconds either way", () => {
    const { nudge } = useLyricsNudge.getState();
    for (let i = 0; i < 100; i++) nudge("a", LYRICS_NUDGE_STEP);
    expect(useLyricsNudge.getState().nudges.a).toBe(NUDGE_LIMIT_SEC);
    for (let i = 0; i < 200; i++) nudge("a", -LYRICS_NUDGE_STEP);
    expect(useLyricsNudge.getState().nudges.a).toBe(-NUDGE_LIMIT_SEC);
  });

  it("resets one song without touching the others", () => {
    const { nudge, resetNudge } = useLyricsNudge.getState();
    nudge("a", 1);
    nudge("b", -1);
    resetNudge("a");
    expect(useLyricsNudge.getState().nudges).toEqual({ b: -1 });
  });

  it("keeps the newest 500 songs and drops the oldest first", () => {
    const { nudge } = useLyricsNudge.getState();
    for (let i = 0; i < NUDGE_KEEP + 3; i++) nudge(`song${i}`, 0.25);
    const keys = Object.keys(useLyricsNudge.getState().nudges);
    expect(keys).toHaveLength(NUDGE_KEEP);
    expect(keys[0]).toBe("song3");
    expect(keys.at(-1)).toBe(`song${NUDGE_KEEP + 2}`);
  });

  it("rounds to hundredths", () => {
    expect(clampNudge(0.123456)).toBe(0.12);
    expect(clampNudge(-12)).toBe(-10);
  });
});

describe("describeLyricsShift", () => {
  it.each([
    [0, "In sync"],
    [0.25, "0.25 s later"],
    [-2.75, "2.75 s earlier"],
    [1, "1 s later"],
  ])("describes %d as %s", (nudge, text) => {
    expect(describeLyricsShift(nudge)).toBe(text);
  });
});

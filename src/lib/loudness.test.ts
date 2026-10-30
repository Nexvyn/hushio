import { describe, expect, it } from "vitest";
import {
  analysable,
  FALLBACK_LUFS,
  gainForLufs,
  gainForTrack,
  GAINS_MAX,
  Leveling,
  LEVEL_GLIDE_MS,
  Lru,
  MASTER_TRIM,
} from "./loudness";
import { headTrimTarget, tailReached } from "./playbackEdges";

describe("gainForLufs", () => {
  it("attenuates a track louder than the target", () => {
    expect(gainForLufs(-10, -14)).toBeCloseTo(10 ** (-4 / 20), 9);
  });

  it("never boosts a track quieter than the target above 1", () => {
    expect(gainForLufs(-25, -11)).toBe(1);
  });

  it("holds the gain at 0.05 for a very loud track", () => {
    expect(gainForLufs(10, -19)).toBe(0.05);
    expect(gainForLufs(20, -11)).toBe(0.05);
  });

  it("is 1 exactly at the target", () => {
    expect(gainForLufs(-14, -14)).toBe(1);
  });
});

describe("gainForTrack", () => {
  it("uses the fallback loudness for an unknown track", () => {
    expect(gainForTrack(null, "normal")).toBeCloseTo(10 ** (-5 / 20), 9);
    expect(gainForTrack(null, "loud")).toBeCloseTo(10 ** (-2 / 20), 9);
  });

  it("matches the worked values from the spec for the fallback", () => {
    expect(gainForTrack(FALLBACK_LUFS, "normal")).toBeCloseTo(0.562, 3);
    expect(gainForTrack(FALLBACK_LUFS, "loud")).toBeCloseTo(0.794, 3);
  });

  it("gives gain 1 to a track measured at -21 LUFS under loud", () => {
    expect(gainForTrack(-21, "loud")).toBe(1);
  });

  it("plays as mastered when leveling is off", () => {
    expect(gainForTrack(-10, "off")).toBe(MASTER_TRIM);
    expect(gainForTrack(null, "off")).toBe(MASTER_TRIM);
  });
});

describe("analysable", () => {
  it.each([
    [9.9, false],
    [10, true],
    [600, true],
    [1200, true],
    [1200.5, false],
    [Number.NaN, false],
  ])("treats a %s s song as analysable: %s", (duration, expected) => {
    expect(analysable(duration)).toBe(expected);
  });
});

describe("Lru", () => {
  it("evicts the least recently written key past its limit", () => {
    const cache = new Lru<number>(2);

    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 3);
    cache.set("c", 4);

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("c")).toBe(4);
  });

  it("keeps the cache at the 600-entry leveling limit", () => {
    const cache = new Lru<number>(GAINS_MAX);
    for (let i = 0; i <= GAINS_MAX; i++) cache.set(`t${i}`, i);

    expect(cache.has("t0")).toBe(false);
    expect(cache.has(`t${GAINS_MAX}`)).toBe(true);
  });
});

describe("Leveling", () => {
  const NOW = 1_000_000;

  it("returns the target gain for a known track", () => {
    const leveling = new Leveling(() => "normal");

    leveling.setLoudness("a", -10, false, NOW);

    expect(leveling.known("a")).toBe(true);
    expect(leveling.gainOf("a", NOW)).toBeCloseTo(10 ** (-4 / 20), 9);
  });

  it("uses the fallback gain for a track it has not measured", () => {
    const leveling = new Leveling(() => "normal");

    expect(leveling.known("a")).toBe(false);
    expect(leveling.gainOf("a", NOW)).toBeCloseTo(gainForTrack(null, "normal"), 9);
  });

  it("returns master trim when no track is loaded", () => {
    expect(new Leveling(() => "loud").gainOf(undefined, NOW)).toBe(MASTER_TRIM);
  });

  it("takes a new loudness at once when the track is not heard", () => {
    const leveling = new Leveling(() => "normal");
    leveling.setLoudness("a", -9, false, NOW);
    leveling.setLoudness("a", -20, false, NOW + 10);

    expect(leveling.gliding()).toBe(false);
    expect(leveling.gainOf("a", NOW + 10)).toBe(1);
  });

  it("glides with a cosine ease when a heard track changes level", () => {
    const leveling = new Leveling(() => "normal");
    leveling.setLoudness("a", -9, false, NOW);
    const from = leveling.gainOf("a", NOW);

    leveling.setLoudness("a", -20, true, NOW);
    const target = gainForTrack(-20, "normal");

    expect(leveling.gliding()).toBe(true);
    expect(leveling.gainOf("a", NOW)).toBeCloseTo(from, 9);
    expect(leveling.gainOf("a", NOW + LEVEL_GLIDE_MS / 2)).toBeCloseTo((from + target) / 2, 9);
    expect(leveling.gainOf("a", NOW + LEVEL_GLIDE_MS)).toBeCloseTo(target, 9);
  });

  it("does not glide when the gain barely changes", () => {
    const leveling = new Leveling(() => "normal");
    leveling.setLoudness("a", -14, false, NOW);

    leveling.setLoudness("a", -14.00001, true, NOW);

    expect(leveling.gliding()).toBe(false);
  });

  it("drops glides older than the glide length on tick", () => {
    const leveling = new Leveling(() => "normal");
    leveling.setLoudness("a", -9, false, NOW);
    leveling.setLoudness("a", -20, true, NOW);

    leveling.tick(NOW + LEVEL_GLIDE_MS);
    expect(leveling.gliding()).toBe(true);
    leveling.tick(NOW + LEVEL_GLIDE_MS + 1);
    expect(leveling.gliding()).toBe(false);
  });

  it("clears every glide at once", () => {
    const leveling = new Leveling(() => "normal");
    leveling.setLoudness("a", -9, false, NOW);
    leveling.setLoudness("a", -20, true, NOW);

    leveling.clearGlides();

    expect(leveling.gliding()).toBe(false);
  });

  it("reads the level setting when it computes a gain", () => {
    let level: "normal" | "loud" = "normal";
    const leveling = new Leveling(() => level);
    leveling.setLoudness("a", -10, false, NOW);
    const under = leveling.gainOf("a", NOW);

    level = "loud";

    expect(leveling.gainOf("a", NOW)).toBeCloseTo(gainForLufs(-10, -11), 9);
    expect(leveling.gainOf("a", NOW)).toBeGreaterThan(under);
  });
});

describe("playback edges", () => {
  it("trims a head longer than 0.05 s while the playhead is near the start", () => {
    expect(headTrimTarget(2.5, 0)).toBe(2.5);
    expect(headTrimTarget(2.5, 0.5)).toBe(2.5);
  });

  it("does not trim a head of 0.05 s or less, or one that playback has passed", () => {
    expect(headTrimTarget(0.05, 0)).toBeNull();
    expect(headTrimTarget(0, 0)).toBeNull();
    expect(headTrimTarget(Number.NaN, 0)).toBeNull();
    expect(headTrimTarget(2.5, 3)).toBeNull();
  });

  it("reports the tail once the playhead is within the tail and 0.05 s of the end", () => {
    expect(tailReached(196.9, 200, 3)).toBe(false);
    expect(tailReached(196.96, 200, 3)).toBe(true);
    expect(tailReached(199, 200, 3)).toBe(true);
  });

  it("never reports a tail without a duration or a tail longer than 0.05 s", () => {
    expect(tailReached(100, Number.NaN, 3)).toBe(false);
    expect(tailReached(199, 200, 0.05)).toBe(false);
  });
});

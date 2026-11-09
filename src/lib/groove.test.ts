import { describe, expect, it } from "vitest";
import {
  GROOVE_SIZES,
  clamp01,
  grooveSeed,
  grooveValueText,
  hillEnvelope,
  hillOffset,
  grooveBoxHeight,
  lyricAt,
  ratioAt,
  rubberBandOffset,
  seekTarget,
  stepWaveLevel,
} from "./groove";

describe("groove hills", () => {
  const seed = grooveSeed("track-a");
  const progressX = 300;
  const stage = GROOVE_SIZES.stage;

  it("pins the envelope to the bar at both ends and peaks in the middle", () => {
    expect(hillEnvelope(0)).toBeCloseTo(0, 6);
    expect(hillEnvelope(1)).toBeCloseTo(0, 6);
    expect(hillEnvelope(0.5)).toBeCloseTo(1, 6);
    expect(hillEnvelope(0.5)).toBeGreaterThan(hillEnvelope(0.2));
  });

  it("meets the bar at the start and just before the knob", () => {
    expect(hillOffset(0, progressX, 2, seed, 1, stage, 1)).toBeCloseTo(0, 6);
    expect(hillOffset(progressX, progressX, 2, seed, 1, stage, 1)).toBeCloseTo(0, 6);
  });

  it("never dips below the bar and never rises past the hill height", () => {
    for (let x = -10; x <= progressX + 10; x += 3) {
      for (const layer of [0, 1] as const) {
        const offset = hillOffset(x, progressX, 1.7, seed, layer, stage, 1);
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(stage.hill * 1.05);
      }
    }
  });

  it("is deterministic for a seed and time, and differs between seeds", () => {
    expect(hillOffset(120, progressX, 4.5, seed, 1, stage, 1)).toBe(hillOffset(120, progressX, 4.5, seed, 1, stage, 1));
    const other = grooveSeed("track-b");
    const a = Array.from({ length: 40 }, (_, i) => hillOffset(i * 7, progressX, 1, seed, 1, stage, 1));
    const b = Array.from({ length: 40 }, (_, i) => hillOffset(i * 7, progressX, 1, other, 1, stage, 1));
    expect(a).not.toEqual(b);
  });

  it("keeps a still shape when paused rather than a flat bar", () => {
    const still = Array.from({ length: 60 }, (_, i) => hillOffset(i * 5, progressX, 3, seed, 1, stage, 0));
    expect(Math.max(...still)).toBeGreaterThan(stage.hill * 0.5);
    expect(new Set(still.map((value) => value.toFixed(3))).size).toBeGreaterThan(10);
  });

  it("moves while playing, and the back layer is offset in phase", () => {
    expect(hillOffset(150, progressX, 0, seed, 1, stage, 1)).not.toBeCloseTo(hillOffset(150, progressX, 2.5, seed, 1, stage, 1), 3);
    const back = Array.from({ length: 40 }, (_, i) => hillOffset(i * 6, progressX, 1, seed, 0, stage, 1));
    const front = Array.from({ length: 40 }, (_, i) => hillOffset(i * 6, progressX, 1, seed, 1, stage, 1));
    expect(back).not.toEqual(front);
  });

  it("is zero at zero progress", () => {
    expect(hillOffset(10, 0, 3, seed, 1, stage, 1)).toBe(0);
    expect(hillOffset(10, -4, 3, seed, 1, stage, 1)).toBe(0);
  });

  it("clamps positions past the ends of the played part", () => {
    expect(hillOffset(-50, progressX, 2, seed, 1, stage, 1)).toBe(hillOffset(0, progressX, 2, seed, 1, stage, 1));
    expect(hillOffset(progressX + 50, progressX, 2, seed, 1, stage, 1)).toBe(hillOffset(progressX, progressX, 2, seed, 1, stage, 1));
  });

  it("peaks inside the played part and falls back to the bar at the ends", () => {
    const samples = Array.from({ length: 21 }, (_, i) => hillEnvelope(i / 20));
    const peak = samples.indexOf(Math.max(...samples));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(20);
    expect(samples[20]).toBeCloseTo(0, 6);
    expect(hillEnvelope(0.97)).toBeLessThan(0.2);
  });

  it("makes the box as tall as the hills and the knob, with the bar centred", () => {
    expect(grooveBoxHeight(GROOVE_SIZES.stage)).toBe(21);
    expect(grooveBoxHeight(GROOVE_SIZES.bar)).toBe(14);
    expect(grooveBoxHeight(GROOVE_SIZES.compact)).toBe(11);
    for (const size of Object.values(GROOVE_SIZES)) {
      const barTop = (grooveBoxHeight(size) - size.bar) / 2;
      expect(barTop - size.hill).toBeGreaterThanOrEqual(0);
    }
  });

  it("sizes the capsule, hills and knob per mode", () => {
    expect(GROOVE_SIZES.stage).toEqual({ bar: 6, hill: 7, knob: 14 });
    expect(GROOVE_SIZES.bar).toEqual({ bar: 4, hill: 4, knob: 10 });
    expect(GROOVE_SIZES.compact).toEqual({ bar: 3, hill: 3, knob: 8 });
    for (const size of Object.values(GROOVE_SIZES)) expect(size.hill).toBeLessThanOrEqual(size.bar * 2);
  });

  it("eases the wave level toward its target without overshooting", () => {
    expect(stepWaveLevel(0, 1, 0.1)).toBeCloseTo(0.25, 6);
    expect(stepWaveLevel(0.9, 1, 1)).toBe(1);
    expect(stepWaveLevel(1, 0, 0.1)).toBeCloseTo(0.75, 6);
    expect(stepWaveLevel(0.05, 0, 1)).toBe(0);
  });
});

describe("seed and ratios", () => {
  it("hashes ids to stable unsigned seeds", () => {
    expect(grooveSeed("a")).toBe(grooveSeed("a"));
    expect(grooveSeed("a")).toBeGreaterThanOrEqual(0);
  });

  it("clamps ratios and treats an empty track as zero", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(ratioAt(50, 200)).toBe(0.25);
    expect(ratioAt(50, 0)).toBe(0);
  });
});

describe("rubber band", () => {
  it("does not move inside the track", () => {
    expect(rubberBandOffset(0, 300)).toBe(0);
  });

  it("keeps the direction of the pull", () => {
    expect(rubberBandOffset(40, 300)).toBeGreaterThan(0);
    expect(rubberBandOffset(-40, 300)).toBeLessThan(0);
  });

  it("resists more the further it is pulled, without leaving the track size", () => {
    const near = Math.abs(rubberBandOffset(20, 300));
    const far = Math.abs(rubberBandOffset(200, 300));
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(300);
  });
});

describe("seeking", () => {
  it("moves 5 s with the arrows and 15 s with shift", () => {
    expect(seekTarget("ArrowRight", false, 60, 200)).toBe(65);
    expect(seekTarget("ArrowLeft", false, 60, 200)).toBe(55);
    expect(seekTarget("ArrowRight", true, 60, 200)).toBe(75);
    expect(seekTarget("ArrowLeft", true, 60, 200)).toBe(45);
  });

  it("clamps to the song", () => {
    expect(seekTarget("ArrowLeft", false, 2, 200)).toBe(0);
    expect(seekTarget("ArrowRight", false, 198, 200)).toBe(200);
  });

  it("jumps to the start and end with Home and End", () => {
    expect(seekTarget("Home", false, 90, 200)).toBe(0);
    expect(seekTarget("End", false, 90, 200)).toBe(200);
  });

  it("ignores other keys", () => {
    expect(seekTarget("a", false, 10, 200)).toBeNull();
  });
});

describe("lyric tooltip line", () => {
  const lines = [
    { time: 0, text: "intro" },
    { time: 10, text: "first line" },
    { time: 20, text: "second line" },
    { time: 300, text: "past the end" },
  ];

  it("returns the line that is current at a time", () => {
    expect(lyricAt(lines, 5)).toBe("intro");
    expect(lyricAt(lines, 15)).toBe("first line");
    expect(lyricAt(lines, 99)).toBe("second line");
  });

  it("returns null before the first line", () => {
    expect(lyricAt([{ time: 4, text: "late" }], 1)).toBeNull();
    expect(lyricAt([], 1)).toBeNull();
  });

  it("formats the value text as a time of a total", () => {
    expect(grooveValueText(69, 213)).toBe("1:09 of 3:33");
  });
});

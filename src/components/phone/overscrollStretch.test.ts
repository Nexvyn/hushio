import { describe, expect, it } from "vitest";
import { STRETCH_MAX_SCALE } from "../../lib/motion";
import {
  atBottom,
  atTop,
  nextStretchDistance,
  stretchDistance,
  stretchGestureAxis,
  stretchScale,
  stretchSideFor,
  topStretchFor,
} from "./overscrollStretch";

describe("stretchScale", () => {
  it("is 1 with no pull", () => {
    expect(stretchScale(0)).toBe(1);
    expect(stretchScale(-40)).toBe(1);
  });

  it("grows smoothly and never passes the cap", () => {
    const samples = [1, 50, 200, 600, 2000, 100000].map(stretchScale);
    for (let i = 1; i < samples.length; i += 1) expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    for (const value of samples) expect(value).toBeLessThanOrEqual(1 + STRETCH_MAX_SCALE);
    expect(stretchScale(1e9)).toBeCloseTo(1 + STRETCH_MAX_SCALE, 4);
  });

  it("inverts back to the same distance", () => {
    for (const distance of [10, 120, 600, 1500]) {
      expect(stretchDistance(stretchScale(distance))).toBeCloseTo(distance, 6);
    }
    expect(stretchDistance(1)).toBe(0);
  });
});

describe("atTop and atBottom", () => {
  it("detects the top edge", () => {
    expect(atTop(0)).toBe(true);
    expect(atTop(-3)).toBe(true);
    expect(atTop(1)).toBe(false);
  });

  it("detects the bottom edge within one pixel", () => {
    expect(atBottom(600, 400, 1000)).toBe(true);
    expect(atBottom(599, 400, 1000)).toBe(true);
    expect(atBottom(590, 400, 1000)).toBe(false);
  });
});

describe("stretchSideFor", () => {
  const metrics = { scrollTop: 0, clientHeight: 400, scrollHeight: 1000 };

  it("stretches the top when pulling down at the top", () => {
    expect(stretchSideFor(6, metrics, { top: true, bottom: true })).toBe("top");
  });

  it("stretches the bottom when pulling up at the bottom", () => {
    expect(stretchSideFor(-6, { ...metrics, scrollTop: 600 }, { top: true, bottom: true })).toBe("bottom");
  });

  it("ignores a direction that points into the content", () => {
    expect(stretchSideFor(-6, metrics, { top: true, bottom: true })).toBeNull();
    expect(stretchSideFor(6, { ...metrics, scrollTop: 600 }, { top: true, bottom: true })).toBeNull();
  });

  it("ignores a mid-list position", () => {
    expect(stretchSideFor(6, { ...metrics, scrollTop: 300 }, { top: true, bottom: true })).toBeNull();
  });

  it("respects disabled edges", () => {
    expect(stretchSideFor(6, metrics, { top: false, bottom: true })).toBeNull();
    expect(stretchSideFor(-6, { ...metrics, scrollTop: 600 }, { top: true, bottom: false })).toBeNull();
  });
});

describe("nextStretchDistance", () => {
  it("grows toward the stretch and reduces on reversal before going negative", () => {
    expect(nextStretchDistance(0, "top", 10)).toBe(10);
    expect(nextStretchDistance(10, "top", -4)).toBe(6);
    expect(nextStretchDistance(6, "top", -20)).toBe(0);
    expect(nextStretchDistance(0, "bottom", -10)).toBe(10);
    expect(nextStretchDistance(10, "bottom", 4)).toBe(6);
  });
});

describe("stretchGestureAxis", () => {
  it("locks to the dominant axis past the slop and stays undecided below it", () => {
    expect(stretchGestureAxis(2, 3)).toBeNull();
    expect(stretchGestureAxis(20, 4)).toBe("x");
    expect(stretchGestureAxis(3, 20)).toBe("y");
  });
});

describe("topStretchFor", () => {
  it("leaves the top edge to pull-to-refresh on Home and Charts", () => {
    expect(topStretchFor("home")).toBe(false);
    expect(topStretchFor("charts")).toBe(false);
    expect(topStretchFor("search")).toBe(true);
    expect(topStretchFor("album")).toBe(true);
  });
});

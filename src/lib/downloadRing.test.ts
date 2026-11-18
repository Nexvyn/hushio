import { describe, expect, it } from "vitest";
import { RING_LENGTH, downloadVisual, ringDashOffset } from "./downloadRing";
import { burstVectors, BURST_DOTS } from "./heartBurst";
import { OVERSHOOT_EASE, toggleKeyframes } from "./toggleMotion";
import { flightKeyframes, flightPlan } from "./flyToTarget";

describe("ringDashOffset", () => {
  it("is full length at zero and zero at complete", () => {
    expect(ringDashOffset(0)).toBeCloseTo(RING_LENGTH);
    expect(ringDashOffset(1)).toBeCloseTo(0);
  });
  it("clamps out of range and bad values", () => {
    expect(ringDashOffset(2)).toBe(0);
    expect(ringDashOffset(-1)).toBeCloseTo(RING_LENGTH);
    expect(ringDashOffset(Number.NaN)).toBeCloseTo(RING_LENGTH);
  });
  it("is halfway at 0.5", () => {
    expect(ringDashOffset(0.5, 100)).toBe(50);
  });
});

describe("downloadVisual", () => {
  it("prefers busy over done and falls back to idle", () => {
    expect(downloadVisual(true, false)).toBe("busy");
    expect(downloadVisual(true, true)).toBe("busy");
    expect(downloadVisual(false, true)).toBe("done");
    expect(downloadVisual(false, false)).toBe("idle");
  });
});

describe("burstVectors", () => {
  it("places seven dots on a circle starting straight up", () => {
    const dots = burstVectors();
    expect(dots).toHaveLength(BURST_DOTS);
    expect(BURST_DOTS).toBeGreaterThanOrEqual(6);
    expect(BURST_DOTS).toBeLessThanOrEqual(8);
    expect(dots[0].x).toBeCloseTo(0);
    expect(dots[0].y).toBeCloseTo(-20);
    for (const dot of dots) {
      expect(Math.hypot(dot.x, dot.y)).toBeCloseTo(20, 0);
    }
  });
});

describe("toggleKeyframes", () => {
  it("nudges shuffle only when it turns on", () => {
    expect(toggleKeyframes("shuffle", "on")?.prop).toBe("x");
    expect(toggleKeyframes("shuffle", "on")?.values).toEqual([0, 3, -3, 0]);
    expect(toggleKeyframes("shuffle", "off")).toBeNull();
  });
  it("rotates repeat once on every change", () => {
    expect(toggleKeyframes("repeat", "all")?.values).toEqual([0, 180]);
    expect(toggleKeyframes("repeat", "off")?.prop).toBe("rotate");
  });
  it("pops the like heart up with an overshoot on like and shrinks on unlike", () => {
    expect(toggleKeyframes("like", "on")?.ease).toEqual(OVERSHOOT_EASE);
    expect(toggleKeyframes("like", "on")?.values).toEqual([0.8, 1.15, 1]);
    expect(toggleKeyframes("like", "off")?.values).toEqual([1, 0.85, 1]);
  });
});

describe("flightPlan", () => {
  const from = { left: 100, top: 400, width: 48, height: 48 };
  const to = { left: 300, top: 100, width: 24, height: 24 };
  it("moves from the source centre to the target centre", () => {
    const plan = flightPlan(from, to);
    expect(plan.dx).toBe(200 + 12 - 24);
    expect(plan.dy).toBe(100 + 12 - 424);
  });
  it("shrinks toward the target size, within bounds", () => {
    expect(flightPlan(from, to).scale).toBeCloseTo(0.5);
    expect(flightPlan({ ...from, width: 4 }, to).scale).toBe(1);
    expect(flightPlan({ ...from, width: 400 }, to).scale).toBe(0.3);
  });
  it("builds three keyframes ending at the target", () => {
    const frames = flightKeyframes(flightPlan(from, to));
    expect(frames).toHaveLength(3);
    expect(frames[2].offset).toBe(1);
    expect(String(frames[2].transform)).toContain("scale(0.5)");
  });
});

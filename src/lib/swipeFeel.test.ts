import { describe, expect, it } from "vitest";
import {
  commitDistance,
  discPose,
  rubberBand,
  shouldCommit,
  SIDEBAR_COMMIT_PX,
  TOP_BAR_COMMIT_PX,
} from "./swipeFeel";

describe("rubber band", () => {
  it("follows the fingers 1:1 inside the range", () => {
    expect(rubberBand(-40, false)).toBe(-40);
  });

  it("travels a quarter as far past the first or last view", () => {
    expect(rubberBand(-200, true)).toBe(-50);
    expect(rubberBand(80, true)).toBe(20);
  });
});

describe("commit thresholds", () => {
  it("uses 50 px for the sidebar and 31.2 px for the top bar", () => {
    expect(commitDistance("sidebar")).toBe(SIDEBAR_COMMIT_PX);
    expect(commitDistance("topBar")).toBe(TOP_BAR_COMMIT_PX);
    expect(SIDEBAR_COMMIT_PX).toBe(50);
    expect(TOP_BAR_COMMIT_PX).toBe(31.2);
  });

  it("commits at exactly the threshold in either direction", () => {
    expect(shouldCommit(-50, "sidebar")).toBe(true);
    expect(shouldCommit(49.9, "sidebar")).toBe(false);
    expect(shouldCommit(-31.2, "topBar")).toBe(true);
    expect(shouldCommit(30, "topBar")).toBe(false);
  });
});

describe("swipe disc", () => {
  it("starts small and closed at zero travel", () => {
    const pose = discPose(0, true, false);
    expect(pose.offsetX).toBeCloseTo(10);
    expect(pose.scale).toBeCloseTo(0.86);
    expect(pose.arcOffset).toBe(1);
  });

  it("closes the arc and grows over 110 px of travel", () => {
    const pose = discPose(110, true, false);
    expect(pose.scale).toBeCloseTo(1);
    expect(pose.arcOffset).toBeCloseTo(0);
    expect(pose.offsetX).toBeCloseTo(10 + 0.2 * 150 * (1 - Math.exp(-1)));
  });

  it("moves to the side of the arrow it belongs to and adds the going offset", () => {
    expect(discPose(40, false, false).offsetX).toBeLessThan(0);
    expect(discPose(40, true, true).offsetX).toBeCloseTo(discPose(40, true, false).offsetX + 12);
    expect(discPose(40, true, true).scale).toBe(1.08);
  });
});

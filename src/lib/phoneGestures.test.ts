import { describe, expect, it } from "vitest";
import {
  edgeBackCommits,
  edgeShadowAlpha,
  edgeStarts,
  isDoubleTap,
  pullDistance,
  pullTriggers,
  railChange,
  rowCommits,
  rowFollow,
  swipeCommits,
  PULL_TRIGGER_PX,
  ROW_REVEAL_PX,
} from "./phoneGestures";
import { swipeAxis } from "./trackSwipe";
import { rubberBand } from "./gesturePhysics";

describe("swipeCommits", () => {
  it("ignores no movement", () => {
    expect(swipeCommits(0, 0, 50)).toBe(false);
  });

  it("commits past the distance threshold", () => {
    expect(swipeCommits(-50, 0, 50)).toBe(true);
    expect(swipeCommits(-49, 0, 50)).toBe(false);
  });

  it("commits a short flick in the same direction", () => {
    expect(swipeCommits(20, 900, 120)).toBe(true);
    expect(swipeCommits(20, 100, 120)).toBe(false);
  });

  it("does not commit a flick that runs the other way", () => {
    expect(swipeCommits(20, -900, 120)).toBe(false);
  });

  it("needs a minimum drag before a flick counts", () => {
    expect(swipeCommits(4, 2000, 120)).toBe(false);
  });
});

describe("railChange", () => {
  const base = { threshold: 114, canPrev: true, canNext: true };

  it("skips to next on a left drag past the threshold", () => {
    expect(railChange({ ...base, offset: -120, velocity: 0 })).toBe("next");
  });

  it("skips to previous on a right drag past the threshold", () => {
    expect(railChange({ ...base, offset: 120, velocity: 0 })).toBe("prev");
  });

  it("respects missing neighbours", () => {
    expect(railChange({ ...base, canNext: false, offset: -200, velocity: 0 })).toBeNull();
    expect(railChange({ ...base, canPrev: false, offset: 200, velocity: 0 })).toBeNull();
  });

  it("stays put for a small slow drag", () => {
    expect(railChange({ ...base, offset: -30, velocity: -40 })).toBeNull();
  });
});

describe("rowFollow", () => {
  it("follows the finger inside the reveal", () => {
    expect(rowFollow(40, ROW_REVEAL_PX)).toBe(40);
    expect(rowFollow(-40, ROW_REVEAL_PX)).toBe(-40);
  });

  it("rubber-bands past the reveal and keeps the sign", () => {
    const shown = rowFollow(196, ROW_REVEAL_PX);
    expect(shown).toBeGreaterThan(ROW_REVEAL_PX);
    expect(shown).toBeLessThan(196);
    expect(rowFollow(-196, ROW_REVEAL_PX)).toBe(-shown);
  });

  it("with no reveal, the whole drag is rubber-banded", () => {
    expect(rowFollow(100, 0)).toBeCloseTo(30);
  });
});

describe("rowCommits", () => {
  it("needs the row threshold or a flick", () => {
    expect(rowCommits(-79, 0)).toBe(false);
    expect(rowCommits(-80, 0)).toBe(true);
    expect(rowCommits(30, 1200)).toBe(true);
  });
});

describe("direction lock", () => {
  it("locks to the horizontal axis only when the drag is mostly sideways", () => {
    expect(swipeAxis(4, 4)).toBeNull();
    expect(swipeAxis(30, 5)).toBe("x");
    expect(swipeAxis(5, 30)).toBe("y");
  });
});

describe("edge back", () => {
  it("starts only inside the zone that begins past the Android system back zone", () => {
    expect(edgeStarts(0)).toBe(false);
    expect(edgeStarts(23)).toBe(false);
    expect(edgeStarts(24)).toBe(true);
    expect(edgeStarts(44)).toBe(true);
    expect(edgeStarts(45)).toBe(false);
  });

  it("shades the left edge in proportion to the drag, up to 0.18", () => {
    expect(edgeShadowAlpha(0, 400)).toBe(0);
    expect(edgeShadowAlpha(100, 400)).toBeCloseTo(0.09);
    expect(edgeShadowAlpha(400, 400)).toBeCloseTo(0.18);
    expect(edgeShadowAlpha(-50, 400)).toBe(0);
  });

  it("commits past 35 percent of the width, or on a rightward flick", () => {
    expect(edgeBackCommits(140, 0, 400)).toBe(true);
    expect(edgeBackCommits(100, 0, 400)).toBe(false);
    expect(edgeBackCommits(30, 1500, 400)).toBe(true);
  });

  it("never commits leftward", () => {
    expect(edgeBackCommits(-300, 0, 400)).toBe(false);
  });
});

describe("pull to refresh", () => {
  it("ignores upward drags", () => {
    expect(pullDistance(-50, 919)).toBe(0);
  });

  it("rubber-bands the pull and never moves further than the finger", () => {
    expect(pullDistance(100, 919)).toBeCloseTo(rubberBand(100, 919));
    expect(pullDistance(200, 919)).toBeGreaterThan(pullDistance(100, 919));
    expect(pullDistance(100, 919)).toBeLessThan(100);
  });

  it("reaches the trigger after a finger travel of about 120 to 160 px", () => {
    expect(pullTriggers(pullDistance(120, 919))).toBe(false);
    expect(pullTriggers(pullDistance(160, 919))).toBe(true);
  });

  it("triggers at the threshold", () => {
    expect(pullTriggers(PULL_TRIGGER_PX - 1)).toBe(false);
    expect(pullTriggers(PULL_TRIGGER_PX)).toBe(true);
  });
});

describe("isDoubleTap", () => {
  const first = { t: 1000, x: 100, y: 200 };

  it("is false without a previous tap", () => {
    expect(isDoubleTap(null, first)).toBe(false);
  });

  it("is true for a quick tap in the same place", () => {
    expect(isDoubleTap(first, { t: 1200, x: 104, y: 198 })).toBe(true);
  });

  it("is false when the taps are too far apart in time or space", () => {
    expect(isDoubleTap(first, { t: 1400, x: 100, y: 200 })).toBe(false);
    expect(isDoubleTap(first, { t: 1100, x: 160, y: 200 })).toBe(false);
  });
});

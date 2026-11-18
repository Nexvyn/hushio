import { describe, expect, it } from "vitest";
import { HOME_INTRO_WINDOW_MS, claimHomeIntro, revealDelayMs, revealMode } from "./homeIntro";
import { DURATION_MS } from "./motion";

describe("claimHomeIntro", () => {
  it("grants the intro once per session", () => {
    const session = { claimed: false };
    expect(claimHomeIntro(session)).toBe(true);
    expect(claimHomeIntro(session)).toBe(false);
    expect(claimHomeIntro(session)).toBe(false);
  });
});

describe("revealMode", () => {
  const base = { intro: true, firstPaint: true, elapsedMs: 0, reduced: false };

  it("staggers the first load inside the intro window", () => {
    expect(revealMode(base)).toBe("intro");
    expect(revealMode({ ...base, firstPaint: false, elapsedMs: HOME_INTRO_WINDOW_MS })).toBe("intro");
  });

  it("fades shelves that arrive after the intro window", () => {
    expect(revealMode({ ...base, firstPaint: false, elapsedMs: HOME_INTRO_WINDOW_MS + 1 })).toBe("append");
  });

  it("never replays on a later visit to Home", () => {
    expect(revealMode({ intro: false, firstPaint: true, elapsedMs: 0, reduced: false })).toBe("still");
    expect(revealMode({ intro: false, firstPaint: false, elapsedMs: 5000, reduced: false })).toBe("append");
  });

  it("skips motion when reduced motion is on", () => {
    expect(revealMode({ ...base, reduced: true })).toBe("still");
  });
});

describe("revealDelayMs", () => {
  it("staggers by the item step and caps at five items", () => {
    expect(revealDelayMs(0)).toBe(0);
    expect(revealDelayMs(1)).toBe(DURATION_MS.stagger);
    expect(revealDelayMs(4)).toBe(4 * DURATION_MS.stagger);
    expect(revealDelayMs(9)).toBe(4 * DURATION_MS.stagger);
  });
});

import { describe, expect, it } from "vitest";
import {
  isSwipeDismiss,
  pauseLifetime,
  progressPercent,
  resumeLifetime,
  sameToast,
  stackSlot,
  toastLifetime,
  trackToastOptions,
} from "./toastStack";

describe("toastLifetime", () => {
  it("uses 3.5 s for a plain message", () => {
    expect(toastLifetime("info", false)).toBe(3500);
    expect(toastLifetime("success", false)).toBe(3500);
  });

  it("keeps errors up for 6 s", () => {
    expect(toastLifetime("error", false)).toBe(6000);
  });

  it("uses 5 s when the toast has an action", () => {
    expect(toastLifetime("info", true)).toBe(5000);
    expect(toastLifetime("error", true)).toBe(5000);
  });

  it("honours an explicit duration", () => {
    expect(toastLifetime("error", true, 9000)).toBe(9000);
    expect(toastLifetime("info", false, 0)).toBe(3500);
  });
});

describe("sameToast", () => {
  it("matches the same message, kind and action label", () => {
    expect(sameToast({ message: "Saved", kind: "info" }, { message: "Saved", kind: "info" })).toBe(true);
    expect(
      sameToast(
        { message: "Removed", kind: "info", action: { label: "Undo" } },
        { message: "Removed", kind: "info", action: { label: "Undo" } },
      ),
    ).toBe(true);
  });

  it("keeps different kinds, messages and actions apart", () => {
    expect(sameToast({ message: "Saved", kind: "info" }, { message: "Saved", kind: "success" })).toBe(false);
    expect(sameToast({ message: "Saved", kind: "info" }, { message: "Done", kind: "info" })).toBe(false);
    expect(
      sameToast({ message: "Removed", kind: "info", action: { label: "Undo" } }, { message: "Removed", kind: "info" }),
    ).toBe(false);
  });
});

describe("stackSlot", () => {
  it("keeps the newest toast in flow at full size", () => {
    expect(stackSlot(0, "top", false)).toMatchObject({ inFlow: true, visible: true, scale: 1, y: 0, zIndex: 100 });
    expect(stackSlot(0, "bottom", false)).toMatchObject({ inFlow: true, scale: 1, y: 0 });
  });

  it("scales older toasts to 0.94 and 0.88 and tucks them 8 px per level", () => {
    const second = stackSlot(1, "top", false);
    const third = stackSlot(2, "top", false);
    expect(second).toMatchObject({ inFlow: false, visible: true, y: 8 });
    expect(second.scale).toBeCloseTo(0.94);
    expect(third).toMatchObject({ inFlow: false, visible: true, y: 16 });
    expect(third.scale).toBeCloseTo(0.88);
  });

  it("tucks older toasts upwards when the stack sits at the bottom", () => {
    expect(stackSlot(1, "bottom", false).y).toBe(-8);
    expect(stackSlot(2, "bottom", false).y).toBe(-16);
  });

  it("hides anything beyond the three visible toasts", () => {
    expect(stackSlot(3, "bottom", false).visible).toBe(false);
  });

  it("lays every toast out in flow when the stack is expanded", () => {
    for (const depth of [0, 1, 2, 3]) {
      expect(stackSlot(depth, "top", true)).toMatchObject({ inFlow: true, visible: true, scale: 1, y: 0 });
    }
  });

  it("stacks newer toasts in front", () => {
    expect(stackSlot(0, "top", false).zIndex).toBeGreaterThan(stackSlot(1, "top", false).zIndex);
  });
});

describe("timer pause and resume", () => {
  it("subtracts only the time that ran before a pause", () => {
    const running = resumeLifetime({ remaining: 3500, startedAt: null }, 1000);
    const paused = pauseLifetime(running, 1800);
    expect(paused).toEqual({ remaining: 2700, startedAt: null });
  });

  it("keeps the remaining time while paused and picks up after resuming", () => {
    const paused = { remaining: 2700, startedAt: null };
    expect(pauseLifetime(paused, 9000)).toBe(paused);
    expect(resumeLifetime(paused, 5000)).toEqual({ remaining: 2700, startedAt: 5000 });
  });

  it("never goes below zero", () => {
    const running = resumeLifetime({ remaining: 500, startedAt: null }, 0);
    expect(pauseLifetime(running, 4000).remaining).toBe(0);
  });
});

describe("isSwipeDismiss", () => {
  it("dismisses on a clear swipe up", () => {
    expect(isSwipeDismiss({ x: 0, y: -60 }, { x: 0, y: 0 })).toBe(true);
  });

  it("dismisses on a fast flick up even when short", () => {
    expect(isSwipeDismiss({ x: 0, y: -10 }, { x: 0, y: -600 })).toBe(true);
  });

  it("dismisses on a sideways swipe", () => {
    expect(isSwipeDismiss({ x: 110, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });

  it("ignores small drags and downward drags", () => {
    expect(isSwipeDismiss({ x: 4, y: -12 }, { x: 0, y: -90 })).toBe(false);
    expect(isSwipeDismiss({ x: 0, y: 60 }, { x: 0, y: 300 })).toBe(false);
  });
});

describe("progressPercent", () => {
  it("clamps to 0 to 100", () => {
    expect(progressPercent(0.5)).toBe(50);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(2)).toBe(100);
  });
});

describe("trackToastOptions", () => {
  it("passes the cover and a title with the artist", () => {
    expect(trackToastOptions({ title: "Song", artist: "Band", thumb: "cover.jpg" })).toEqual({
      art: "cover.jpg",
      detail: "Song · Band",
    });
  });

  it("drops a missing cover and an empty artist", () => {
    expect(trackToastOptions({ title: "Song", artist: "", thumb: null })).toEqual({ art: undefined, detail: "Song" });
  });
});

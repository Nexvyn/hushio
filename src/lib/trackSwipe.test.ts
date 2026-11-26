import { describe, expect, it } from "vitest";
import { neighbourTracks, swipeAxis, trackSwipeChange } from "./trackSwipe";
import type { Track } from "../types";


describe("swipeAxis", () => {
  it("waits for 10px before locking an axis", () => {
    expect(swipeAxis(5, 4)).toBeNull();
  });

  it("locks horizontal or vertical by the larger movement", () => {
    expect(swipeAxis(30, 5)).toBe("x");
    expect(swipeAxis(5, -30)).toBe("y");
  });
});

describe("trackSwipeChange", () => {
  const base = { distance: 100, canPrev: true, canNext: true };

  it("changes to next on a leftward drag past the distance", () => {
    expect(trackSwipeChange({ ...base, offset: -120, velocity: 0 })).toBe("next");
  });

  it("changes to prev on a rightward drag past the distance", () => {
    expect(trackSwipeChange({ ...base, offset: 120, velocity: 0 })).toBe("prev");
  });

  it("does not change on a short drag that stays short", () => {
    expect(trackSwipeChange({ ...base, offset: -80, velocity: -20 })).toBeNull();
  });

  it("changes on a short drag that a fast flick carries past the distance", () => {
    expect(trackSwipeChange({ ...base, offset: -20, velocity: -900 })).toBe("next");
    expect(trackSwipeChange({ ...base, offset: 20, velocity: 100 })).toBeNull();
  });

  it("does not change when a long drag is flicked back the other way", () => {
    expect(trackSwipeChange({ ...base, offset: -120, velocity: 2000 })).toBeNull();
  });

  it("never changes toward a missing neighbour", () => {
    expect(trackSwipeChange({ ...base, canNext: false, offset: -300, velocity: -900 })).toBeNull();
    expect(trackSwipeChange({ ...base, canPrev: false, offset: 300, velocity: 900 })).toBeNull();
  });

  it("supports the mini player threshold of 32px", () => {
    const mini = { distance: 32, canPrev: true, canNext: true };
    expect(trackSwipeChange({ ...mini, offset: -33, velocity: 0 })).toBe("next");
    expect(trackSwipeChange({ ...mini, offset: 10, velocity: 401 })).toBe("prev");
    expect(trackSwipeChange({ ...mini, offset: -10, velocity: 0 })).toBeNull();
  });
});

describe("neighbourTracks", () => {
  const track = (id: string): Track => ({ id, title: id, artist: "", thumb: null });
  const queue = [track("a"), track("b"), track("c")];

  it("returns the previous and next queue items", () => {
    expect(neighbourTracks(queue, 1)).toEqual({ prev: queue[0], next: queue[2] });
  });

  it("returns null on the sides with no track", () => {
    expect(neighbourTracks(queue, 0)).toEqual({ prev: null, next: queue[1] });
    expect(neighbourTracks(queue, 2)).toEqual({ prev: queue[1], next: null });
    expect(neighbourTracks([], 0)).toEqual({ prev: null, next: null });
  });

  it("fills a missing side from the playing playlist around the same track", () => {
    const solo = [track("b")];
    const source = [track("a"), track("b"), track("c")];
    expect(neighbourTracks(solo, 0, source)).toEqual({ prev: source[0], next: source[2] });
  });

  it("keeps the queue neighbour over the playlist one", () => {
    const source = [track("x"), track("a"), track("b"), track("y")];
    expect(neighbourTracks(queue, 1, source)).toEqual({ prev: queue[0], next: queue[2] });
  });
});

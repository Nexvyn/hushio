import { describe, expect, it } from "vitest";
import { VelocityTracker } from "./velocity";

describe("VelocityTracker", () => {
  it("reports a constant speed in px per second", () => {
    const tracker = new VelocityTracker();
    tracker.reset(0, 0);
    for (let t = 16; t <= 64; t += 16) tracker.add(t, (t / 1000) * 500);
    expect(tracker.velocity(64)).toBeCloseTo(500, 5);
  });

  it("drops samples older than 80 ms so a fast flick wins over a slow start", () => {
    const tracker = new VelocityTracker();
    tracker.reset(0, 0);
    tracker.add(20, 0);
    tracker.add(40, 0);
    tracker.add(120, 100);
    tracker.add(130, 200);
    expect(tracker.velocity(130)).toBeCloseTo(((200 - 100) / (130 - 120)) * 1000, 5);
  });

  it("replaces a sample that has the same timestamp instead of adding a zero-length span", () => {
    const tracker = new VelocityTracker();
    tracker.reset(1000, 100);
    tracker.add(2000, 600);
    tracker.add(2000, 600);
    expect(tracker.velocity(2000)).toBeCloseTo(500, 5);
  });

  it("reports zero when the last sample is more than 100 ms old", () => {
    const tracker = new VelocityTracker();
    tracker.reset(0, 0);
    tracker.add(16, 10);
    expect(tracker.velocity(130)).toBe(0);
  });

  it("reports zero with fewer than two samples", () => {
    const tracker = new VelocityTracker();
    expect(tracker.velocity(0)).toBe(0);
    tracker.reset(0, 5);
    expect(tracker.velocity(0)).toBe(0);
  });
});

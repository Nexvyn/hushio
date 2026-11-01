import { describe, expect, it } from "vitest";
import { dailyRotation, dayBucket, daySeed, seededUnit } from "./seeded";

const DAY_MS = 86_400_000;

describe("dayBucket", () => {
  it("counts UTC days from the epoch", () => {
    expect(dayBucket(0)).toBe(0);
    expect(dayBucket(DAY_MS - 1)).toBe(0);
    expect(dayBucket(DAY_MS)).toBe(1);
    expect(dayBucket(DAY_MS * 20_000 + 5)).toBe(20_000);
  });
});

describe("daySeed", () => {
  it("changes only when the UTC day changes", () => {
    const morning = Date.UTC(2026, 10, 9, 0, 1);
    const night = Date.UTC(2026, 10, 9, 23, 59);
    const nextDay = Date.UTC(2026, 10, 10, 0, 1);

    expect(daySeed(morning)).toBe(daySeed(night));
    expect(daySeed(nextDay)).not.toBe(daySeed(morning));
  });
});

describe("seededUnit", () => {
  it("repeats for the same key and seed and stays in [0, 1)", () => {
    const value = seededUnit("artist-1", 42);

    expect(seededUnit("artist-1", 42)).toBe(value);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(seededUnit("artist-2", 42)).not.toBe(value);
  });
});

describe("dailyRotation", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("gives the same permutation for the same key and day without changing the input", () => {
    const seed = daySeed(Date.UTC(2026, 10, 9, 12));
    const first = dailyRotation(items, "side-x", seed);

    expect(dailyRotation(items, "side-x", seed)).toEqual(first);
    expect([...first].sort()).toEqual(items);
    expect(items).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
  });

  it("changes the order on the next day", () => {
    const today = dailyRotation(items, "side-x", daySeed(Date.UTC(2026, 10, 9, 12)));
    const tomorrow = dailyRotation(items, "side-x", daySeed(Date.UTC(2026, 10, 10, 12)));

    expect(tomorrow).not.toEqual(today);
  });

  it("returns an empty list for empty input", () => {
    expect(dailyRotation([], "side-x", 1)).toEqual([]);
  });
});

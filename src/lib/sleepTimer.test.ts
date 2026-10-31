import { describe, expect, it } from "vitest";
import { formatSleepLeft, parseSleepMinutes, sleepLevel } from "./sleepTimer";

describe("parseSleepMinutes", () => {
  it.each([
    ["90", 90],
    ["  15 ", 15],
    ["1:30", 90],
    ["0:05", 5],
    ["1h 30m", 90],
    ["2h30m", 150],
    ["1h", 60],
    ["1H 30M", 90],
    ["45 min", 45],
    ["30m", 30],
  ])("reads %j as %i minutes", (input, minutes) => {
    expect(parseSleepMinutes(input)).toBe(minutes);
  });

  it.each(["", "   ", "abc", "1:5", "12345", "1h 90", "1.5"])("rejects %j", (input) => {
    expect(parseSleepMinutes(input)).toBeNull();
  });
});

describe("formatSleepLeft", () => {
  it.each([
    [245_000, "4:05"],
    [3_723_000, "1:02:03"],
    [3_600_000, "1:00:00"],
    [59_001, "1:00"],
    [0, "0:00"],
    [-5_000, "0:00"],
    [59_999, "1:00"],
    [1_000, "0:01"],
    [36_000_000, "10:00:00"],
  ])("formats %i ms as %j", (ms, text) => {
    expect(formatSleepLeft(ms)).toBe(text);
  });
});

describe("sleepLevel", () => {
  it.each([
    [20_000, 1],
    [10_000, 1],
    [5_000, 0.5],
    [0, 0],
    [-1_000, 0],
    [9_999, 0.9999],
    [7_500, 0.75],
    [2_500, 0.25],
    [10_001, 1],
  ])("gives %i ms remaining a level of %d", (remaining, level) => {
    expect(sleepLevel(remaining)).toBe(level);
  });
});

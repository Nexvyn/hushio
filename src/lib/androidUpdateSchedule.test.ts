import { describe, expect, it } from "vitest";
import { ANDROID_UPDATE_INTERVAL_MS, shouldCheck } from "./androidUpdateSchedule";

const DAY = ANDROID_UPDATE_INTERVAL_MS;
const NOW = 1_800_000_000_000;

describe("shouldCheck", () => {
  it("checks when there has never been a check", () => {
    expect(shouldCheck(null, NOW, true, true)).toBe(true);
  });

  it("skips while the last check is less than 24 hours old", () => {
    expect(shouldCheck(NOW - 1000, NOW, true, true)).toBe(false);
    expect(shouldCheck(NOW - DAY + 1, NOW, true, true)).toBe(false);
  });

  it("checks again once 24 hours have passed", () => {
    expect(shouldCheck(NOW - DAY, NOW, true, true)).toBe(true);
    expect(shouldCheck(NOW - 3 * DAY, NOW, true, true)).toBe(true);
  });

  it("checks when the stored time is in the future, such as after a clock change", () => {
    expect(shouldCheck(NOW + 60_000, NOW, true, true)).toBe(true);
  });

  it("never checks when the setting is off", () => {
    expect(shouldCheck(null, NOW, false, true)).toBe(false);
    expect(shouldCheck(NOW - 3 * DAY, NOW, false, true)).toBe(false);
  });

  it("never checks while offline", () => {
    expect(shouldCheck(null, NOW, true, false)).toBe(false);
    expect(shouldCheck(NOW - 3 * DAY, NOW, true, false)).toBe(false);
  });
});

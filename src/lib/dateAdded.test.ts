import { describe, expect, it } from "vitest";
import { formatAddedAt } from "./dateAdded";

const now = new Date(2026, 10, 19, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe("formatAddedAt", () => {
  it("shows nothing for songs saved before the date was recorded", () => {
    expect(formatAddedAt(undefined, now)).toBe("");
  });

  it("uses relative days under a week", () => {
    expect(formatAddedAt(now - 2 * 60 * 60 * 1000, now)).toBe("Today");
    expect(formatAddedAt(now - DAY - 60 * 1000, now)).toBe("1 day ago");
    expect(formatAddedAt(now - 3 * DAY, now)).toBe("3 days ago");
    expect(formatAddedAt(now - 6 * DAY, now)).toBe("6 days ago");
  });

  it("uses a calendar date from a week on", () => {
    expect(formatAddedAt(new Date(2026, 10, 3, 12).getTime(), now)).toBe("Nov 3, 2026");
    expect(formatAddedAt(now - 7 * DAY, now)).toBe("Nov 12, 2026");
  });
});

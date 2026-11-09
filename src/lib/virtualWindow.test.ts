import { describe, expect, it } from "vitest";
import { rowWindow, usesWindowing, VIRTUAL_THRESHOLD } from "./virtualWindow";

const ROW = 56;

describe("usesWindowing", () => {
  it("starts above 200 rows", () => {
    expect(VIRTUAL_THRESHOLD).toBe(200);
    expect(usesWindowing(200)).toBe(false);
    expect(usesWindowing(201)).toBe(true);
  });
});

describe("rowWindow", () => {
  it("renders every row of a short list", () => {
    expect(rowWindow({ count: 150, rowHeight: ROW, offset: 5000, viewport: 600 })).toEqual({ start: 0, end: 150 });
  });

  it("renders no rows for an empty list", () => {
    expect(rowWindow({ count: 0, rowHeight: ROW, offset: 0, viewport: 600 })).toEqual({ start: 0, end: 0 });
  });

  it("renders the visible rows plus overscan at the top", () => {
    expect(rowWindow({ count: 1000, rowHeight: ROW, offset: 0, viewport: 560 })).toEqual({ start: 0, end: 16 });
  });

  it("follows the scroll offset", () => {
    expect(rowWindow({ count: 1000, rowHeight: ROW, offset: 100 * ROW, viewport: 560 })).toEqual({
      start: 94,
      end: 116,
    });
  });

  it("clamps at the end of the list", () => {
    expect(rowWindow({ count: 1000, rowHeight: ROW, offset: 990 * ROW, viewport: 560 })).toEqual({
      start: 984,
      end: 1000,
    });
  });

  it("ignores a negative offset", () => {
    expect(rowWindow({ count: 1000, rowHeight: ROW, offset: -300, viewport: 560 })).toEqual({ start: 0, end: 16 });
  });
});

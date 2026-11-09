import { describe, expect, it } from "vitest";
import { pressMoved, sheetCloses, sheetTravel, swipeOf } from "./touchGesture";

describe("swipeOf", () => {
  const origin = { x: 200, y: 400 };

  it("reads each direction from the dominant axis", () => {
    expect(swipeOf(origin, { x: 200, y: 300 })).toBe("up");
    expect(swipeOf(origin, { x: 200, y: 500 })).toBe("down");
    expect(swipeOf(origin, { x: 100, y: 400 })).toBe("left");
    expect(swipeOf(origin, { x: 300, y: 400 })).toBe("right");
  });

  it("requires 48 px of travel by default", () => {
    expect(swipeOf(origin, { x: 200, y: 352 })).toBe("up");
    expect(swipeOf(origin, { x: 200, y: 353 })).toBeNull();
    expect(swipeOf(origin, { x: 200, y: 400 })).toBeNull();
  });

  it("treats a diagonal by its larger axis", () => {
    expect(swipeOf(origin, { x: 260, y: 300 })).toBe("up");
    expect(swipeOf(origin, { x: 300, y: 330 })).toBe("right");
  });

  it("accepts a custom threshold", () => {
    expect(swipeOf(origin, { x: 200, y: 390 }, 10)).toBe("up");
    expect(swipeOf(origin, { x: 200, y: 395 }, 10)).toBeNull();
    expect(swipeOf(origin, { x: 200, y: 390 }, 60)).toBeNull();
  });
});

describe("pressMoved", () => {
  it("is false inside the 10 px slop and true beyond it", () => {
    expect(pressMoved({ x: 0, y: 0 }, { x: 7, y: 7 })).toBe(false);
    expect(pressMoved({ x: 0, y: 0 }, { x: 8, y: 8 })).toBe(true);
    expect(pressMoved({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
  });
});

describe("sheetTravel", () => {
  it("never goes above the resting position", () => {
    expect(sheetTravel(-40)).toBe(0);
    expect(sheetTravel(0)).toBe(0);
    expect(sheetTravel(30)).toBe(30);
  });
});

describe("sheetCloses", () => {
  it("closes only past 40% of the sheet height", () => {
    expect(sheetCloses(400, 1000, 0)).toBe(false);
    expect(sheetCloses(401, 1000, 0)).toBe(true);
  });

  it("closes on a fast downward release above 500 dp/s", () => {
    expect(sheetCloses(50, 1000, 500)).toBe(false);
    expect(sheetCloses(50, 1000, 501)).toBe(true);
  });

  it("uses only the fling when the height is unknown", () => {
    expect(sheetCloses(400, 0, 0)).toBe(false);
    expect(sheetCloses(400, 0, 600)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  autoScrollStep,
  clampOffset,
  edgeOverflow,
  shiftFor,
  slotFor,
  sortKeys,
  spanAt,
} from "./sortable";

const boxes = [
  { top: 0, height: 50 },
  { top: 60, height: 50 },
  { top: 120, height: 50 },
];

describe("slotFor", () => {
  it("keeps the row in place for a small offset", () => {
    expect(slotFor(0, boxes, 0)).toBe(0);
  });

  it("moves down once the centre passes the next row's midpoint", () => {
    expect(slotFor(0, boxes, 70)).toBe(1);
    expect(slotFor(0, boxes, 200)).toBe(2);
  });

  it("moves up when the centre rises above earlier midpoints", () => {
    expect(slotFor(2, boxes, -130)).toBe(0);
    expect(slotFor(2, boxes, -70)).toBe(1);
  });
});

describe("clampOffset", () => {
  it("keeps the visual travel between the first and last slot", () => {
    expect(clampOffset(100, boxes, 1)).toBe(60);
    expect(clampOffset(-100, boxes, 1)).toBe(-60);
    expect(clampOffset(12, boxes, 1)).toBe(12);
  });
});

describe("spanAt", () => {
  it("uses the pitch to the neighbour below, or above for the last row", () => {
    expect(spanAt(0, boxes)).toBe(60);
    expect(spanAt(2, boxes)).toBe(60);
    expect(spanAt(0, [{ top: 0, height: 40 }])).toBe(40);
  });
});

describe("shiftFor", () => {
  it("slides the rows between the start and the target up when moving down", () => {
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 0, 2, 60))).toEqual([0, -60, -60, 0]);
  });

  it("slides the rows between the target and the start down when moving up", () => {
    expect([0, 1, 2].map((index) => shiftFor(index, 2, 0, 60))).toEqual([60, 60, 0]);
  });

  it("leaves every row alone when the target is the start", () => {
    expect([0, 1, 2].map((index) => shiftFor(index, 1, 1, 60))).toEqual([0, 0, 0]);
  });
});

describe("edgeOverflow", () => {
  it("is zero away from the auto-scroll zones", () => {
    expect(edgeOverflow(100, 0, 500)).toBe(0);
  });

  it("is negative near the top edge and positive near the bottom edge", () => {
    expect(edgeOverflow(10, 0, 500)).toBe(-38);
    expect(edgeOverflow(490, 0, 500)).toBe(38);
  });
});

describe("autoScrollStep", () => {
  it("scales with the overflow and caps at 18 px", () => {
    expect(autoScrollStep(0)).toBe(0);
    expect(autoScrollStep(-38)).toBe(-13);
    expect(autoScrollStep(-100)).toBe(-18);
    expect(autoScrollStep(1)).toBe(1);
  });
});

describe("sortKeys", () => {
  it("keeps duplicate ids apart with a counter", () => {
    expect(sortKeys(["a", "b", "a"])).toEqual(["a#0", "b#0", "a#1"]);
  });
});

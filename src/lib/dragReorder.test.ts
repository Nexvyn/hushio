import { describe, expect, it } from "vitest";
import { autoScrollStep, dropIndex, moveItem, slideOffset } from "./dragReorder";

describe("moveItem", () => {
  it("moves an item and returns a new array", () => {
    const list = ["a", "b", "c", "d"];
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(list, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps the target and ignores a bad source", () => {
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("dropIndex", () => {
  it("rounds the finger travel to whole rows and clamps to the list", () => {
    expect(dropIndex(2, 0, 56, 6)).toBe(2);
    expect(dropIndex(2, 84, 56, 6)).toBe(4);
    expect(dropIndex(2, 27, 56, 6)).toBe(2);
    expect(dropIndex(2, -500, 56, 6)).toBe(0);
    expect(dropIndex(2, 900, 56, 6)).toBe(5);
  });
});

describe("slideOffset", () => {
  it("moves rows between the old and new slot out of the way", () => {
    expect(slideOffset(1, 0, 3, 56)).toBe(-56);
    expect(slideOffset(3, 0, 3, 56)).toBe(-56);
    expect(slideOffset(4, 0, 3, 56)).toBe(0);
    expect(slideOffset(3, 4, 1, 56)).toBe(56);
    expect(slideOffset(0, 4, 1, 56)).toBe(0);
  });

  it("keeps the dragged row and an unmoved list at rest", () => {
    expect(slideOffset(0, 0, 3, 56)).toBe(0);
    expect(slideOffset(2, 2, 2, 56)).toBe(0);
  });
});

describe("autoScrollStep", () => {
  it("scrolls up when the finger is within the top edge and faster the closer it gets", () => {
    expect(autoScrollStep(100, 0, 600, 50, 18)).toBe(0);
    expect(autoScrollStep(25, 0, 600, 50, 18)).toBeCloseTo(-9);
    expect(autoScrollStep(-40, 0, 600, 50, 18)).toBe(-18);
  });

  it("scrolls down when the finger is within the bottom edge", () => {
    expect(autoScrollStep(300, 0, 600, 50, 18)).toBe(0);
    expect(autoScrollStep(575, 0, 600, 50, 18)).toBeCloseTo(9);
    expect(autoScrollStep(700, 0, 600, 50, 18)).toBe(18);
  });
});

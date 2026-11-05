import { describe, expect, it } from "vitest";
import { rovingTarget } from "./roving";

describe("rovingTarget", () => {
  it("moves one step along its own axis and clamps at the ends", () => {
    expect(rovingTarget(1, 4, "ArrowDown", "vertical")).toBe(2);
    expect(rovingTarget(3, 4, "ArrowDown", "vertical")).toBe(3);
    expect(rovingTarget(0, 4, "ArrowUp", "vertical")).toBe(0);
  });

  it("ignores keys on the other axis", () => {
    expect(rovingTarget(1, 4, "ArrowLeft", "vertical")).toBeNull();
    expect(rovingTarget(1, 4, "ArrowUp", "horizontal")).toBeNull();
    expect(rovingTarget(1, 4, "ArrowRight", "horizontal")).toBe(2);
  });

  it("Home and End jump to the first and last item on any axis", () => {
    expect(rovingTarget(2, 5, "Home", "horizontal")).toBe(0);
    expect(rovingTarget(2, 5, "End", "vertical")).toBe(4);
  });

  it("starts from the first item when nothing has focus yet", () => {
    expect(rovingTarget(-1, 4, "ArrowDown", "vertical")).toBe(0);
    expect(rovingTarget(-1, 4, "ArrowUp", "vertical")).toBe(3);
  });

  it("returns null for an empty list or an unrelated key", () => {
    expect(rovingTarget(0, 0, "ArrowDown", "vertical")).toBeNull();
    expect(rovingTarget(0, 3, "Enter", "both")).toBeNull();
  });
});

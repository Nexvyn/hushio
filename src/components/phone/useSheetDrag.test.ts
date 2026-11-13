import { describe, expect, it } from "vitest";
import { dragOffset, sheetReleaseCloses } from "./useSheetDrag";

describe("sheetReleaseCloses", () => {
  const screen = 800;

  it("closes when the drag passes 28% of the screen height", () => {
    expect(sheetReleaseCloses(224, screen, 0)).toBe(false);
    expect(sheetReleaseCloses(225, screen, 0)).toBe(true);
  });

  it("closes on a downward fling over 600px/s even for a short drag", () => {
    expect(sheetReleaseCloses(20, screen, 600)).toBe(false);
    expect(sheetReleaseCloses(20, screen, 601)).toBe(true);
  });

  it("springs back for a short, slow drag", () => {
    expect(sheetReleaseCloses(100, screen, 200)).toBe(false);
  });
});

describe("dragOffset", () => {
  it("follows a downward drag one to one", () => {
    expect(dragOffset(150)).toBe(150);
  });

  it("rubber bands upward past the rest position at 0.3", () => {
    expect(dragOffset(-100)).toBeCloseTo(-30);
  });
});

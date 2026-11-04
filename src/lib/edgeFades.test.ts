import { describe, expect, it } from "vitest";
import { edgeFadeState } from "./edgeFades";

describe("edge fade state", () => {
  it("shows no fade when nothing scrolls", () => {
    expect(edgeFadeState(0, 300, 300)).toEqual({ start: false, end: false });
    expect(edgeFadeState(0, 300.5, 300)).toEqual({ start: false, end: false });
  });

  it("fades only the edge that has content beyond it", () => {
    expect(edgeFadeState(0, 1000, 300)).toEqual({ start: false, end: true });
    expect(edgeFadeState(350, 1000, 300)).toEqual({ start: true, end: true });
    expect(edgeFadeState(700, 1000, 300)).toEqual({ start: true, end: false });
  });

  it("treats a 1 px sub-pixel offset as the edge", () => {
    expect(edgeFadeState(0.5, 1000, 300)).toEqual({ start: false, end: true });
    expect(edgeFadeState(699.5, 1000, 300)).toEqual({ start: true, end: false });
  });
});

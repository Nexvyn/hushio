import { describe, expect, it } from "vitest";
import { railFor, shellFor } from "./layoutTier";

describe("shellFor", () => {
  it.each([
    [360, "phone"],
    [599, "phone"],
    [839, "phone"],
    [840, "tablet"],
    [1280, "tablet"],
  ] as const)("width %i dp is %s", (width, mode) => {
    expect(shellFor(width)).toBe(mode);
  });
});

describe("railFor", () => {
  it.each([
    [839, "hidden"],
    [840, "sheet"],
    [1199, "sheet"],
    [1200, "column"],
    [1600, "column"],
  ] as const)("width %i dp shows the rail as %s", (width, mode) => {
    expect(railFor(width)).toBe(mode);
  });
});

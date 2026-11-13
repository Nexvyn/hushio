import { describe, expect, it } from "vitest";
import { railFor, shellFor, sidebarFor } from "./layoutTier";

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

describe("sidebarFor", () => {
  it.each([
    [900, "rail"],
    [1099, "rail"],
    [1100, "full"],
    [1536, "full"],
  ] as const)("width %i dp shows the sidebar as %s", (width, mode) => {
    expect(sidebarFor(width)).toBe(mode);
  });
});

describe("railFor", () => {
  it.each([
    [900, "sheet"],
    [1199, "sheet"],
    [1200, "column"],
    [1600, "column"],
  ] as const)("width %i dp shows the rail as %s", (width, mode) => {
    expect(railFor(width)).toBe(mode);
  });
});

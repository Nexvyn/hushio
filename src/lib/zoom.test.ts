import { afterEach, describe, expect, it } from "vitest";
import { applyZoom, nextZoom } from "./zoom";

afterEach(() => {
  document.documentElement.style.zoom = "";
});

describe("nextZoom", () => {
  it("steps one level in each direction from a step", () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
  });

  it("moves to the next step from a value between steps", () => {
    expect(nextZoom(1.2, 1)).toBe(1.25);
    expect(nextZoom(1.2, -1)).toBe(1.1);
  });

  it("stops at the smallest and largest levels", () => {
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.75, -1)).toBe(0.75);
  });

  it("resets to 100 percent", () => {
    expect(nextZoom(1.75, 0)).toBe(1);
  });
});

describe("applyZoom", () => {
  it("falls back to CSS zoom outside the desktop webview", async () => {
    await applyZoom(1.25);
    expect(document.documentElement.style.zoom).toBe("1.25");
  });

  it("clears the CSS zoom at 100 percent", async () => {
    await applyZoom(1.5);
    await applyZoom(1);
    expect(document.documentElement.style.zoom).toBe("");
  });
});

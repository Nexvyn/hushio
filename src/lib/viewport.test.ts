import { describe, expect, it } from "vitest";
import { viewportHeight, viewportWidth } from "./viewport";

function setSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

describe("viewport size", () => {
  it("returns the window size", () => {
    setSize(390, 844);
    expect(viewportWidth()).toBe(390);
    expect(viewportHeight()).toBe(844);
  });

  it("updates after a resize event", () => {
    setSize(390, 844);
    expect(viewportHeight()).toBe(844);
    setSize(844, 390);
    window.dispatchEvent(new Event("resize"));
    expect(viewportWidth()).toBe(844);
    expect(viewportHeight()).toBe(390);
  });
});

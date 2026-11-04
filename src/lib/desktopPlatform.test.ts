import { describe, expect, it } from "vitest";
import type { Platform } from "./bridge";
import { hasCaptionButtons, usesNativeMediaControls } from "./desktopPlatform";

describe("caption buttons", () => {
  it("draws them on Windows and Linux, where the window has no system frame", () => {
    expect(hasCaptionButtons("windows")).toBe(true);
    expect(hasCaptionButtons("linux")).toBe(true);
  });

  it("leaves them out on macOS and Android", () => {
    const others: Platform[] = ["macos", "android"];
    expect(others.map(hasCaptionButtons)).toEqual([false, false]);
  });
});

describe("native media controls", () => {
  it("uses the Rust session on Windows (SMTC) and Linux (MPRIS)", () => {
    expect(usesNativeMediaControls("windows")).toBe(true);
    expect(usesNativeMediaControls("linux")).toBe(true);
  });

  it("keeps the page session on macOS and Android", () => {
    expect(usesNativeMediaControls("macos")).toBe(false);
    expect(usesNativeMediaControls("android")).toBe(false);
  });
});

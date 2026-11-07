import { describe, expect, it } from "vitest";
import { detectPlatform } from "./bridge";

describe("detectPlatform", () => {
  it("maps user agents to the four platforms", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5)")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
  });

  it("refuses unknown user agents", () => {
    expect(() => detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toThrow(
      "Unsupported platform",
    );
  });
});

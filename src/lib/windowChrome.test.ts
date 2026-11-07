import { describe, expect, it } from "vitest";
import { hasCaptionButtons } from "./desktopPlatform";
import { MACOS_TRAFFIC_LIGHT_INSET, topBarLeadingInset } from "./windowChrome";

describe("hasCaptionButtons", () => {
  it("draws caption buttons only where the window is frameless", () => {
    expect(hasCaptionButtons("windows")).toBe(true);
    expect(hasCaptionButtons("linux")).toBe(true);
    expect(hasCaptionButtons("macos")).toBe(false);
    expect(hasCaptionButtons("android")).toBe(false);
  });
});

describe("topBarLeadingInset", () => {
  it("reserves 84 px for the traffic lights on macOS only", () => {
    expect(MACOS_TRAFFIC_LIGHT_INSET).toBe(84);
    expect(topBarLeadingInset("macos")).toBe(84);
    expect(topBarLeadingInset("windows")).toBeUndefined();
    expect(topBarLeadingInset("linux")).toBeUndefined();
    expect(topBarLeadingInset("android")).toBeUndefined();
  });
});

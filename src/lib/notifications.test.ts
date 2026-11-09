import { describe, expect, it } from "vitest";
import { parseNotificationState, shouldAskAtPlayback, showNotificationBanner } from "./notifications";

describe("notification permission decisions", () => {
  it("accepts only the three known states and treats anything else as granted", () => {
    expect(parseNotificationState("request")).toBe("request");
    expect(parseNotificationState("settings")).toBe("settings");
    expect(parseNotificationState("denied")).toBe("granted");
    expect(parseNotificationState(undefined)).toBe("granted");
  });

  it("asks at the first playback only, and only when the system still allows a prompt", () => {
    expect(shouldAskAtPlayback("request", false)).toBe(true);
    expect(shouldAskAtPlayback("request", true)).toBe(false);
    expect(shouldAskAtPlayback("settings", false)).toBe(false);
    expect(shouldAskAtPlayback("granted", false)).toBe(false);
  });

  it("shows the banner only while a track plays and notifications are not granted", () => {
    expect(showNotificationBanner("settings", true)).toBe(true);
    expect(showNotificationBanner("request", true)).toBe(true);
    expect(showNotificationBanner("settings", false)).toBe(false);
    expect(showNotificationBanner("granted", true)).toBe(false);
  });
});

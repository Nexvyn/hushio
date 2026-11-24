import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  platform: "android" as string,
  haptics: true,
  native: vi.fn(),
}));

vi.mock("./bridge", () => ({
  get platform() {
    return env.platform;
  },
  hapticTick: env.native,
}));

vi.mock("../stores/settings", () => ({
  useSettings: {
    getState: () => ({ haptics: env.haptics }),
  },
}));

import { haptic } from "./haptics";

let visibility: DocumentVisibilityState = "visible";
let clock = Date.parse("2026-11-13T12:00:00Z");

beforeEach(() => {
  env.platform = "android";
  env.haptics = true;
  visibility = "visible";
  env.native.mockReset();
  vi.useFakeTimers();
  clock += 1000;
  vi.setSystemTime(clock);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("haptic", () => {
  it("sends semantic haptics through the native path", () => {
    haptic("tick");
    vi.advanceTimersByTime(100);
    haptic("select");
    vi.advanceTimersByTime(100);
    haptic("success");
    expect(env.native.mock.calls).toEqual([["tick"], ["select"], ["success"]]);
  });

  it("does nothing outside Android", () => {
    env.platform = "windows";
    haptic("tick");
    expect(env.native).not.toHaveBeenCalled();
  });

  it("does nothing when the setting is off", () => {
    env.haptics = false;
    haptic("tick");
    expect(env.native).not.toHaveBeenCalled();
  });

  it("does nothing while the page is hidden", () => {
    visibility = "hidden";
    haptic("tick");
    expect(env.native).not.toHaveBeenCalled();
  });

  it("ignores a call within 40ms of the last one", () => {
    haptic("tick");
    vi.advanceTimersByTime(39);
    haptic("select");
    expect(env.native).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    haptic("select");
    expect(env.native).toHaveBeenCalledTimes(2);
  });

  it("ignores native failures", () => {
    env.native.mockRejectedValue(new Error("denied"));
    expect(() => haptic("tick")).not.toThrow();
  });
});

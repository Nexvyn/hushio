import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  platform: "android" as string,
  haptics: true,
}));

vi.mock("./bridge", () => ({
  get platform() {
    return env.platform;
  },
}));

vi.mock("../stores/settings", () => ({
  useSettings: {
    getState: () => ({ haptics: env.haptics }),
  },
}));

import { haptic } from "./haptics";

let visibility: DocumentVisibilityState = "visible";
let clock = Date.parse("2026-11-13T12:00:00Z");
const vibrate = vi.fn();

beforeEach(() => {
  env.platform = "android";
  env.haptics = true;
  visibility = "visible";
  vibrate.mockReset();
  vi.useFakeTimers();
  clock += 1000;
  vi.setSystemTime(clock);
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true, writable: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

describe("haptic", () => {
  it("uses the tick, select and success durations", () => {
    haptic("tick");
    vi.advanceTimersByTime(100);
    haptic("select");
    vi.advanceTimersByTime(100);
    haptic("success");
    expect(vibrate.mock.calls).toEqual([[8], [12], [[10, 40, 14]]]);
  });

  it("does nothing outside Android", () => {
    env.platform = "windows";
    haptic("tick");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing when the setting is off", () => {
    env.haptics = false;
    haptic("tick");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing when navigator.vibrate is missing", () => {
    Reflect.deleteProperty(navigator, "vibrate");
    expect(() => haptic("tick")).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("does nothing while the page is hidden", () => {
    visibility = "hidden";
    haptic("tick");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("ignores a call within 40ms of the last one", () => {
    haptic("tick");
    vi.advanceTimersByTime(39);
    haptic("select");
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    haptic("select");
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("never throws when vibrate throws", () => {
    vibrate.mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => haptic("tick")).not.toThrow();
  });
});

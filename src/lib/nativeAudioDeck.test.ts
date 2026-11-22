import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({ isTauri: vi.fn(), invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => core);
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

async function probeResult(): Promise<boolean> {
  vi.resetModules();
  const { usesNativeAudio } = await import("./nativeAudioDeck");
  return usesNativeAudio;
}

describe("usesNativeAudio", () => {
  beforeEach(() => {
    core.isTauri.mockReset().mockReturnValue(true);
    core.invoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the native deck when the desktop probe reports mpv is available", async () => {
    core.invoke.mockResolvedValue(true);
    expect(await probeResult()).toBe(true);
    expect(core.invoke).toHaveBeenCalledTimes(1);
    expect(core.invoke).toHaveBeenCalledWith("desktop_playback_available");
  });

  it("uses the HTML deck when the desktop probe reports mpv is unavailable", async () => {
    core.invoke.mockResolvedValue(false);
    expect(await probeResult()).toBe(false);
  });

  it("uses the HTML deck when the desktop probe fails", async () => {
    core.invoke.mockRejectedValue(new Error("command not found"));
    expect(await probeResult()).toBe(false);
  });

  it("never calls the probe in a plain browser", async () => {
    core.isTauri.mockReturnValue(false);
    expect(await probeResult()).toBe(false);
    expect(core.invoke).not.toHaveBeenCalled();
  });

  it("never calls the probe on Android", async () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36" });
    expect(await probeResult()).toBe(false);
    expect(core.invoke).not.toHaveBeenCalled();
  });
});

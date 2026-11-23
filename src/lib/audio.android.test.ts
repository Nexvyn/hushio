import { beforeEach, describe, expect, it, vi } from "vitest";

const { androidSetVolume } = vi.hoisted(() => ({ androidSetVolume: vi.fn() }));

vi.mock("./androidPlayback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./androidPlayback")>()),
  ANDROID: true,
}));
vi.mock("./androidEngine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./androidEngine")>()),
  androidSetVolume,
}));

import { setMuted, setVolume } from "./audio";

describe("Android volume with mute", () => {
  beforeEach(() => {
    androidSetVolume.mockClear();
    setMuted(false);
    setVolume(1);
    androidSetVolume.mockClear();
  });

  it("keeps the phone silent when a volume change arrives while muted", () => {
    setMuted(true);
    androidSetVolume.mockClear();

    setVolume(0.5);

    expect(androidSetVolume).toHaveBeenLastCalledWith(0);
  });

  it("restores the volume when unmuted", () => {
    setVolume(0.4);
    setMuted(true);

    setMuted(false);

    expect(androidSetVolume).toHaveBeenLastCalledWith(0.4);
  });
});

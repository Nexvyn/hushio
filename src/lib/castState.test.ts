import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  castPlayPause: vi.fn(async () => undefined),
  castSeek: vi.fn(async () => undefined),
  castLoad: vi.fn(async () => undefined),
  castStop: vi.fn(async () => undefined),
  resolveStream: vi.fn(async () => ({ url: "https://media/abc", mime: "audio/mp4; codecs=mp4a" })),
}));

vi.mock("./bridge", () => bridge);
vi.mock("./resolveStream", () => ({ resolveStream: bridge.resolveStream }));

import {
  castPlayPauseFromApp,
  castSeekFromApp,
  castTrackFromApp,
  isCasting,
  setCasting,
  stopCastingFromApp,
} from "./castState";

describe("app controls while casting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCasting(false);
  });

  it("tracks whether a Cast session is active", () => {
    expect(isCasting()).toBe(false);
    setCasting(true);
    expect(isCasting()).toBe(true);
  });

  it("sends play and pause to the receiver", () => {
    castPlayPauseFromApp(false);
    castPlayPauseFromApp(true);

    expect(bridge.castPlayPause).toHaveBeenNthCalledWith(1, false);
    expect(bridge.castPlayPause).toHaveBeenNthCalledWith(2, true);
  });

  it("sends seeks to the receiver in milliseconds", () => {
    castSeekFromApp(12.5);

    expect(bridge.castSeek).toHaveBeenCalledWith(12500);
  });

  it("loads a newly chosen song on the receiver instead of playing it on the phone", async () => {
    await castTrackFromApp("abc", "Next Song", 0, { artist: "Band", artworkUrl: "https://img/a.jpg" });

    expect(bridge.resolveStream).toHaveBeenCalledWith("abc", false, undefined, true);
    expect(bridge.castLoad).toHaveBeenCalledWith({
      url: "https://media/abc",
      contentType: "audio/mp4",
      title: "Next Song",
      artist: "Band",
      artworkUrl: "https://img/a.jpg",
      positionMs: 0,
      playing: true,
    });
  });

  it("stops the receiver and leaves casting mode", () => {
    setCasting(true);

    stopCastingFromApp();

    expect(bridge.castStop).toHaveBeenCalledTimes(1);
    expect(isCasting()).toBe(false);
  });
});

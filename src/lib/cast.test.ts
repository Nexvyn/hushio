import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  castLoad: vi.fn(async () => undefined),
  castOpen: vi.fn(async () => undefined),
  castStatus: vi.fn(),
  resolveStream: vi.fn(),
}));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  castLoad: bridge.castLoad,
  castOpen: bridge.castOpen,
  castStatus: bridge.castStatus,
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));

vi.mock("./resolveStream", () => ({ resolveStream: bridge.resolveStream }));

import { castNowPlaying } from "./cast";
import { usePlayer } from "../stores/player";

const TRACK = { id: "abc", title: "Song", artist: "Band", thumb: "https://img.example/a.jpg" };

describe("Cast now playing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePlayer.setState({ queue: [TRACK], index: 0, position: 12.5, playing: true });
    bridge.resolveStream.mockResolvedValue({ url: "https://stream.example/abc" });
  });

  it("opens the device chooser first when no Cast session is connected", async () => {
    bridge.castStatus.mockResolvedValue({ connected: false, playing: false, positionMs: 0 });

    await expect(castNowPlaying()).resolves.toBe("choose");

    expect(bridge.castOpen).toHaveBeenCalled();
    expect(bridge.castLoad).not.toHaveBeenCalled();
  });

  it("loads the current stream with its title, artist, art and position once connected", async () => {
    bridge.castStatus.mockResolvedValue({ connected: true, playing: false, positionMs: 0 });

    await expect(castNowPlaying()).resolves.toBe("connected");

    expect(bridge.resolveStream).toHaveBeenCalledWith("abc");
    expect(bridge.castLoad).toHaveBeenCalledWith({
      url: "https://stream.example/abc",
      title: "Song",
      artist: "Band",
      artworkUrl: "https://img.example/a.jpg",
      positionMs: 12500,
      playing: true,
    });
  });

  it("does nothing when nothing is queued", async () => {
    usePlayer.setState({ queue: [], index: 0 });

    await expect(castNowPlaying()).resolves.toBe("idle");

    expect(bridge.castStatus).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  castLoad: vi.fn(async () => undefined),
  castOpen: vi.fn(async () => undefined),
  castStatus: vi.fn(),
  resolveStream: vi.fn(),
  listen: vi.fn(async (_event: string, handler: (payload: unknown) => void) => {
    bridge.onSession = handler;
    return () => {};
  }),
  onSession: null as null | ((payload: unknown) => void),
}));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  castLoad: bridge.castLoad,
  castOpen: bridge.castOpen,
  castStatus: bridge.castStatus,
  listenPlayerEvent: bridge.listen,
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));

vi.mock("./resolveStream", () => ({ resolveStream: bridge.resolveStream }));

vi.mock("./audio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./audio")>()),
  pause: vi.fn(),
}));

import { castFromNowPlaying, castNowPlaying, errorText } from "./cast";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const TRACK = { id: "abc", title: "Song", artist: "Band", thumb: "https://img.example/a.jpg" };

async function sessionEvent(payload: { state: string; deviceName?: string | null }): Promise<void> {
  await vi.waitFor(() => expect(bridge.onSession).not.toBeNull());
  bridge.onSession!(payload);
}

describe("Cast now playing", () => {
  const toast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    toast.mockClear();
    useUI.setState({ toast });
    usePlayer.setState({ queue: [TRACK], index: 0, position: 12.5, playing: true });
    bridge.resolveStream.mockResolvedValue({ url: "https://stream.example/abc", mime: 'audio/mp4; codecs="mp4a.40.2"' });
  });

  it("opens the device chooser without a toast when no Cast session is connected", async () => {
    bridge.castStatus.mockResolvedValue({ connected: false, playing: false, positionMs: 0 });

    await expect(castNowPlaying()).resolves.toBe("choose");
    await castFromNowPlaying();

    expect(bridge.castOpen).toHaveBeenCalled();
    expect(bridge.castLoad).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("loads the current stream and pauses local playback when a device starts a session after the chooser", async () => {
    bridge.castStatus.mockResolvedValue({ connected: false, playing: false, positionMs: 0 });
    await castNowPlaying();

    await sessionEvent({ state: "started", deviceName: "Living Room" });

    await vi.waitFor(() => expect(bridge.castLoad).toHaveBeenCalledTimes(1));
    expect(bridge.resolveStream).toHaveBeenCalledWith("abc", false, undefined, true);
    expect(bridge.castLoad).toHaveBeenCalledWith({
      url: "https://stream.example/abc",
      contentType: "audio/mp4",
      title: "Song",
      artist: "Band",
      artworkUrl: "https://img.example/a.jpg",
      positionMs: 12500,
      playing: true,
    });
    await vi.waitFor(() => expect(usePlayer.getState().playing).toBe(false));
    expect(toast).toHaveBeenCalledWith("Casting to Living Room");
  });

  it("ignores a session that starts without a pending chooser", async () => {
    bridge.castStatus.mockResolvedValue({ connected: true, playing: false, positionMs: 0 });
    await castNowPlaying();
    bridge.castLoad.mockClear();
    usePlayer.setState({ playing: true });

    await sessionEvent({ state: "started", deviceName: "TV" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bridge.castLoad).not.toHaveBeenCalled();
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("toasts that casting stopped when the session ends", async () => {
    await sessionEvent({ state: "ended", deviceName: "TV" });

    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Stopped casting"));
  });

  it("loads the current stream with its title, artist, art and position once connected", async () => {
    bridge.castStatus.mockResolvedValue({ connected: true, playing: false, positionMs: 0 });

    await expect(castNowPlaying()).resolves.toBe("connected");

    expect(bridge.resolveStream).toHaveBeenCalledWith("abc", false, undefined, true);
    expect(bridge.castLoad).toHaveBeenCalledWith({
      url: "https://stream.example/abc",
      contentType: "audio/mp4",
      title: "Song",
      artist: "Band",
      artworkUrl: "https://img.example/a.jpg",
      positionMs: 12500,
      playing: true,
    });
    expect(bridge.castOpen).toHaveBeenCalled();
  });

  it("falls back to audio/mp4 when the stream has no mime type", async () => {
    bridge.castStatus.mockResolvedValue({ connected: true, playing: false, positionMs: 0 });
    bridge.resolveStream.mockResolvedValue({ url: "https://stream.example/abc" });

    await castNowPlaying();

    expect(bridge.castLoad).toHaveBeenCalledWith(expect.objectContaining({ contentType: "audio/mp4" }));
  });

  it("does nothing when nothing is queued", async () => {
    usePlayer.setState({ queue: [], index: 0 });

    await expect(castNowPlaying()).resolves.toBe("idle");

    expect(bridge.castStatus).not.toHaveBeenCalled();
  });
});

describe("errorText", () => {
  it("reads the message of a native rejection object", () => {
    expect(errorText({ message: "No Cast device connected" })).toBe("No Cast device connected");
  });

  it("falls back to the JSON of an object without a message and to unknown for no value", () => {
    expect(errorText({ code: "x" })).toBe('{"code":"x"}');
    expect(errorText(undefined)).toBe("unknown error");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  setMediaTrack: vi.fn(async () => {}),
  setMediaPlaying: vi.fn(async () => {}),
  setMediaPosition: vi.fn(async () => {}),
  clearMedia: vi.fn(async () => {}),
  listenMediaButton: vi.fn(async (_onAction: (action: string) => void) => () => {}),
  listenMediaSeek: vi.fn(async (_onSeek: (seconds: number) => void) => () => {}),
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
  playbackEvent: vi.fn(async () => {}),
  lyricsGet: vi.fn(async () => null),
}));

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  ...bridge,
}));

vi.mock("./audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { startSmtc, trackPayload } from "./smtc";
import { usePlayer } from "../stores/player";
import type { Track } from "../types";

const track = (i: number, thumb: string | null = null): Track => ({
  id: `t${i}`,
  title: `Track ${i}`,
  artist: `Artist ${i}`,
  thumb,
});

const initial = usePlayer.getState();

let stop: (() => void) | null = null;

function buttonHandler() {
  const call = bridge.listenMediaButton.mock.calls.at(-1);
  if (!call) throw new Error("button listener not registered");
  return call[0];
}

function seekHandler() {
  const call = bridge.listenMediaSeek.mock.calls.at(-1);
  if (!call) throw new Error("seek listener not registered");
  return call[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initial, true);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  delete (navigator as { mediaSession?: unknown }).mediaSession;
});

describe("trackPayload", () => {
  it("names the app as album and upgrades https covers to 1200", () => {
    const payload = trackPayload(track(0, "https://i.ytimg.com/vi/abc/hqdefault.jpg"), 215);
    expect(payload).toEqual({
      title: "Track 0",
      artist: "Artist 0",
      album: "Hushio",
      thumb: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
      duration: 215,
    });
  });

  it("sends no cover for an unusable thumb and zero for an unknown duration", () => {
    const payload = trackPayload(track(0, "http://example.com/a.jpg"), Number.NaN);
    expect(payload.thumb).toBeNull();
    expect(payload.duration).toBe(0);
  });
});

describe("startSmtc", () => {
  it("pushes the track, playing state and position when a song starts", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0)], index: 0, playing: true, position: 0, duration: 200 });

    expect(bridge.setMediaTrack).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ title: "Track 0", album: "Hushio", duration: 200 }),
    );
    expect(bridge.setMediaPlaying).toHaveBeenCalledExactlyOnceWith(true);
    expect(bridge.setMediaPosition).toHaveBeenCalledExactlyOnceWith(0, 200);
  });

  it("sends the position only after 0.75 s of change", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0)], index: 0, playing: true, position: 0, duration: 200 });
    bridge.setMediaPosition.mockClear();

    usePlayer.setState({ position: 0.5 });
    expect(bridge.setMediaPosition).not.toHaveBeenCalled();

    usePlayer.setState({ position: 1.25 });
    expect(bridge.setMediaPosition).toHaveBeenCalledExactlyOnceWith(1.25, 200);
  });

  it("re-sends the track when the duration becomes known", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0)], index: 0, playing: false, position: 0, duration: 0 });
    bridge.setMediaTrack.mockClear();

    usePlayer.setState({ duration: 180 });
    expect(bridge.setMediaTrack).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ duration: 180 }));
  });

  it("clears the session when the queue empties", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0)], index: 0, playing: false, position: 0, duration: 0 });
    usePlayer.setState({ queue: [], index: 0 });

    expect(bridge.clearMedia).toHaveBeenCalledOnce();
  });

  it("does not clear anything before a song has played", () => {
    stop = startSmtc();
    expect(bridge.clearMedia).not.toHaveBeenCalled();
  });

  it("runs next and previous from the system buttons", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0), track(1)], index: 0, playing: true, position: 0, duration: 0 });

    buttonHandler()("next");
    expect(usePlayer.getState().index).toBe(1);

    buttonHandler()("previous");
    expect(usePlayer.getState().index).toBe(0);
  });

  it("applies a single play press after the 500 ms window", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0)], index: 0, playing: false, position: 0, duration: 0 });

    buttonHandler()("play");
    vi.advanceTimersByTime(499);
    expect(usePlayer.getState().playing).toBe(false);

    vi.advanceTimersByTime(1);
    expect(usePlayer.getState().playing).toBe(true);
  });

  it("moves to the next song on two play presses inside the window", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0), track(1)], index: 0, playing: false, position: 0, duration: 0 });

    buttonHandler()("play");
    vi.advanceTimersByTime(200);
    buttonHandler()("play");
    vi.advanceTimersByTime(500);

    expect(usePlayer.getState().index).toBe(1);
  });

  it("seeks to the position the system asks for", () => {
    stop = startSmtc();
    usePlayer.setState({ queue: [track(0)], index: 0, playing: true, position: 0, duration: 300 });

    seekHandler()(42);
    expect(usePlayer.getState().position).toBe(42);
  });

  it("overrides the page media session so presses are handled once", () => {
    const setActionHandler = vi.fn();
    Object.defineProperty(navigator, "mediaSession", {
      value: { setActionHandler },
      configurable: true,
      writable: true,
    });

    stop = startSmtc();
    const actions = setActionHandler.mock.calls.map(([action]) => action);
    expect(actions).toEqual(expect.arrayContaining(["play", "pause", "nexttrack", "previoustrack"]));
    expect(setActionHandler.mock.calls.every(([, handler]) => typeof handler === "function")).toBe(true);

    setActionHandler.mockClear();
    stop();
    stop = null;
    expect(setActionHandler.mock.calls.every(([, handler]) => handler === null)).toBe(true);
  });
});

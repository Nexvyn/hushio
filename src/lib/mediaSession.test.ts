import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
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

import { createMediaKeyTap, MEDIA_KEY_DOUBLE_TAP_MS, startMediaSession } from "./mediaSession";
import { usePlayer } from "../stores/player";
import type { Track } from "../types";

type Handler = (details: MediaSessionActionDetails) => void;

class FakeMediaMetadata {
  title = "";
  artist = "";
  album = "";
  artwork: MediaImage[] = [];

  constructor(init: MediaMetadataInit) {
    Object.assign(this, init);
  }
}

function fakeSession() {
  const handlers = new Map<MediaSessionAction, Handler | null>();
  return {
    handlers,
    metadata: null as FakeMediaMetadata | null,
    playbackState: "none" as MediaSessionPlaybackState,
    setPositionState: vi.fn(),
    setActionHandler: vi.fn((action: MediaSessionAction, handler: Handler | null) => {
      handlers.set(action, handler);
    }),
  };
}

type FakeSession = ReturnType<typeof fakeSession>;

function invoke(session: FakeSession, action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}) {
  const handler = session.handlers.get(action);
  if (!handler) throw new Error(`no handler for ${action}`);
  handler({ action, ...details } as MediaSessionActionDetails);
}

function installSession(session: FakeSession) {
  Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true, writable: true });
}

function setMediaTimes(duration: number, currentTime = 0) {
  Object.defineProperty(audio, "duration", { value: duration, configurable: true });
  Object.defineProperty(audio, "currentTime", { value: currentTime, writable: true, configurable: true });
}

const track = (i: number, thumb: string | null = null): Track => ({
  id: `t${i}`,
  title: `Track ${i}`,
  artist: `Artist ${i}`,
  thumb,
});
const list = (count: number) => Array.from({ length: count }, (_, i) => track(i));
const state = () => usePlayer.getState();
const initial = usePlayer.getState();

let stop: (() => void) | null = null;
let session: FakeSession;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("MediaMetadata", FakeMediaMetadata);
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initial, true);
  setMediaTimes(0);
  session = fakeSession();
  installSession(session);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (navigator as { mediaSession?: unknown }).mediaSession;
});

describe("createMediaKeyTap", () => {
  it("settles a single press after the 500 ms window with that press", () => {
    const single = vi.fn();
    const multi = vi.fn();
    const tap = createMediaKeyTap({ single, multi });

    tap.press("pause");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS - 1);
    expect(single).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(single).toHaveBeenCalledExactlyOnceWith("pause");
    expect(multi).not.toHaveBeenCalled();
  });

  it("counts two presses inside the window as a double tap", () => {
    const single = vi.fn();
    const multi = vi.fn();
    const tap = createMediaKeyTap({ single, multi });

    tap.press("play");
    vi.advanceTimersByTime(200);
    tap.press("play");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(multi).toHaveBeenCalledOnce();
    expect(single).not.toHaveBeenCalled();
  });

  it("restarts the window on each press (trailing edge)", () => {
    const single = vi.fn();
    const multi = vi.fn();
    const tap = createMediaKeyTap({ single, multi });

    tap.press("play");
    vi.advanceTimersByTime(400);
    tap.press("play");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS - 1);
    expect(multi).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(multi).toHaveBeenCalledOnce();
  });

  it("counts a play and a pause inside the window as a double tap", () => {
    const single = vi.fn();
    const multi = vi.fn();
    const tap = createMediaKeyTap({ single, multi });

    tap.press("play");
    tap.press("pause");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(multi).toHaveBeenCalledOnce();
    expect(single).not.toHaveBeenCalled();
  });

  it("settles once for a stream of presses within the window", () => {
    const single = vi.fn();
    const multi = vi.fn();
    const tap = createMediaKeyTap({ single, multi });

    for (let i = 0; i < 5; i++) {
      tap.press("play");
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(multi).toHaveBeenCalledOnce();
    expect(single).not.toHaveBeenCalled();
  });

  it("drops a pending press when cancelled", () => {
    const single = vi.fn();
    const multi = vi.fn();
    const tap = createMediaKeyTap({ single, multi });

    tap.press("pause");
    tap.press("pause");
    tap.cancelPending();
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS * 2);

    expect(single).not.toHaveBeenCalled();
    expect(multi).not.toHaveBeenCalled();
  });
});

describe("startMediaSession metadata", () => {
  it("publishes title, artist, app album and sized artwork for the current track", () => {
    stop = startMediaSession();
    state().playQueue([track(0, "https://lh3.googleusercontent.com/cover=s544")], 0);

    expect(session.metadata).toMatchObject({ title: "Track 0", artist: "Artist 0", album: "Hushio" });
    expect(session.metadata?.artwork).toEqual([
      { src: "https://lh3.googleusercontent.com/cover=s96", sizes: "96x96", type: "image/jpeg" },
      { src: "https://lh3.googleusercontent.com/cover=s192", sizes: "192x192", type: "image/jpeg" },
      { src: "https://lh3.googleusercontent.com/cover=s512", sizes: "512x512", type: "image/jpeg" },
    ]);
  });

  it("publishes the track album when the track has one", () => {
    stop = startMediaSession();
    state().playQueue([{ ...track(0), album: "Album 0" }], 0);

    expect(session.metadata).toMatchObject({ title: "Track 0", artist: "Artist 0", album: "Album 0" });
  });

  it("falls back to the app name when the track has no album", () => {
    stop = startMediaSession();
    state().playQueue([{ ...track(0), album: null }], 0);

    expect(session.metadata).toMatchObject({ album: "Hushio" });
  });

  it("updates metadata when the track changes", () => {
    stop = startMediaSession();
    state().playQueue(list(3), 0);
    state().next(true);

    expect(session.metadata).toMatchObject({ title: "Track 1", artist: "Artist 1" });
  });

  it("leaves artwork empty when the track has no usable thumbnail", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);

    expect(session.metadata?.artwork).toEqual([]);
  });

  it("clears metadata when the queue is empty", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    usePlayer.setState({ queue: [], index: 0, playing: false });

    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
  });

  it("reports playing and paused states", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    expect(session.playbackState).toBe("playing");

    usePlayer.setState({ playing: false });
    expect(session.playbackState).toBe("paused");
  });
});

describe("startMediaSession action handlers", () => {
  it("pauses after the double-tap window when pause is pressed", () => {
    stop = startMediaSession();
    state().playQueue(list(2), 0);

    invoke(session, "pause");
    expect(pause).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(state().playing).toBe(false);
    expect(play).not.toHaveBeenCalled();
  });

  it("resumes after the double-tap window when play is pressed", () => {
    stop = startMediaSession();
    state().playQueue(list(2), 0);
    state().toggle();
    expect(state().playing).toBe(false);

    invoke(session, "play");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(state().playing).toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });

  it("skips to the next track at once and cancels a pending pause", () => {
    stop = startMediaSession();
    state().playQueue(list(3), 0);

    invoke(session, "pause");
    invoke(session, "nexttrack");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS * 2);

    expect(state().index).toBe(1);
    expect(state().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
    expect(playStream).toHaveBeenLastCalledWith("t1", "Track 1", 0, expect.any(Object));
  });

  it("goes to the previous track at once and cancels a pending press", () => {
    stop = startMediaSession();
    state().playQueue(list(3), 1);

    invoke(session, "play");
    invoke(session, "previoustrack");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS * 2);

    expect(state().index).toBe(0);
    expect(playStream).toHaveBeenLastCalledWith("t0", "Track 0", 0, expect.any(Object));
  });

  it("treats two play or pause presses as next", () => {
    stop = startMediaSession();
    state().playQueue(list(3), 0);

    invoke(session, "pause");
    vi.advanceTimersByTime(100);
    invoke(session, "pause");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(state().index).toBe(1);
    expect(state().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
  });

  it("seeks back and forward by 10 seconds from the current position", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    usePlayer.setState({ position: 25 });

    invoke(session, "seekbackward");
    expect(seekTo).toHaveBeenLastCalledWith(15);

    usePlayer.setState({ position: 4 });
    invoke(session, "seekbackward");
    expect(seekTo).toHaveBeenLastCalledWith(0);

    usePlayer.setState({ position: 5 });
    invoke(session, "seekforward");
    expect(seekTo).toHaveBeenLastCalledWith(15);
  });

  it("seeks to the requested time and ignores a missing one", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);

    invoke(session, "seekto", { seekTime: 42 });
    expect(seekTo).toHaveBeenLastCalledWith(42);

    seekTo.mockClear();
    invoke(session, "seekto");
    expect(seekTo).not.toHaveBeenCalled();
  });
});

describe("startMediaSession position state", () => {
  it("publishes duration and position once per second when the position moves", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    setMediaTimes(200, 0);

    vi.advanceTimersByTime(1000);
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 200, playbackRate: 1, position: 0 });

    setMediaTimes(200, 0.5);
    vi.advanceTimersByTime(1000);
    expect(session.setPositionState).toHaveBeenCalledTimes(1);

    setMediaTimes(200, 3);
    vi.advanceTimersByTime(1000);
    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 200, playbackRate: 1, position: 3 });
  });

  it("clamps the position to the duration", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    setMediaTimes(200, 205);

    vi.advanceTimersByTime(1000);

    expect(session.setPositionState).toHaveBeenLastCalledWith({ duration: 200, playbackRate: 1, position: 200 });
  });

  it("skips position state while the duration is unknown", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    setMediaTimes(Number.NaN, 0);

    vi.advanceTimersByTime(5000);

    expect(session.setPositionState).not.toHaveBeenCalled();
  });
});

describe("startMediaSession cleanup", () => {
  it("removes handlers, metadata and the position timer", () => {
    stop = startMediaSession();
    state().playQueue(list(1), 0);
    setMediaTimes(200, 0);
    vi.advanceTimersByTime(1000);
    session.setPositionState.mockClear();

    stop();
    stop = null;

    for (const action of ["play", "pause", "nexttrack", "previoustrack", "seekto"] as const) {
      expect(session.handlers.get(action)).toBeNull();
    }
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");

    setMediaTimes(200, 50);
    vi.advanceTimersByTime(5000);
    expect(session.setPositionState).not.toHaveBeenCalled();
  });

  it("stops following player changes after cleanup", () => {
    stop = startMediaSession();
    stop();
    stop = null;
    session.metadata = null;

    state().playQueue(list(1), 0);

    expect(session.metadata).toBeNull();
  });

  it("does nothing when the platform has no media session", () => {
    delete (navigator as { mediaSession?: unknown }).mediaSession;

    const teardown = startMediaSession();
    state().playQueue(list(1), 0);

    expect(() => teardown()).not.toThrow();
    expect(session.setActionHandler).not.toHaveBeenCalled();
  });
});

describe("startMediaSession redundant presses", () => {
  it("ignores a single play press while playback is already running", () => {
    stop = startMediaSession();
    state().playQueue(list(2), 0);

    invoke(session, "play");
    vi.advanceTimersByTime(MEDIA_KEY_DOUBLE_TAP_MS);

    expect(state().playing).toBe(true);
    expect(pause).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { audio, playStream, playbackEvent } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  playbackEvent: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  playbackEvent,
}));

import { usePlayer } from "./player";
import type { Track } from "../types";

const song = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: `Title ${id}`, artist: "Artist", thumb: null, ...extra });
const T0 = new Date(2026, 9, 15, 21, 0, 0).getTime();

function fire(type: string) {
  audio.dispatchEvent(new Event(type));
}

function sent() {
  return playbackEvent.mock.calls.map((call) => call[0] as { type: string; track?: { id: string }; deltaMs?: number });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  playStream.mockReset().mockResolvedValue(undefined);
  playbackEvent.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(audio, "duration", { configurable: true, get: () => NaN });
  usePlayer.setState({ queue: [], index: 0, playing: false, played: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("player and listening events", () => {
  it("sends start when a track starts", () => {
    usePlayer.getState().playQueue([song("a")]);
    expect(sent()).toEqual([expect.objectContaining({ type: "start", track: expect.objectContaining({ id: "a" }) })]);
  });

  it("sends progress deltas from the audio events and sends no delta for a pause at the last tick", () => {
    usePlayer.getState().playQueue([song("a")]);
    fire("playing");
    vi.setSystemTime(T0 + 10_000);
    fire("timeupdate");
    fire("pause");
    vi.setSystemTime(T0 + 20_000);
    fire("timeupdate");
    expect(sent().map((event) => [event.type, event.deltaMs])).toEqual([
      ["start", undefined],
      ["resume", undefined],
      ["progress", 10_000],
    ]);
  });

  it("does not count the loading time before the first playing event", () => {
    usePlayer.getState().playQueue([song("a")]);
    vi.setSystemTime(T0 + 8_000);
    fire("timeupdate");
    expect(sent().map((event) => event.type)).toEqual(["start"]);
  });

  it("sends the audio duration with each event once it is known", () => {
    Object.defineProperty(audio, "duration", { configurable: true, get: () => 200 });
    usePlayer.getState().playQueue([song("a")]);
    fire("durationchange");
    fire("playing");
    vi.setSystemTime(T0 + 5_000);
    fire("timeupdate");
    expect(playbackEvent.mock.calls.at(-1)?.[0]).toMatchObject({ type: "progress", deltaMs: 5_000, track: { duration: 200 } });
  });

  it("closes the previous track when the next one starts", () => {
    usePlayer.getState().playQueue([song("a"), song("b")]);
    fire("playing");
    vi.setSystemTime(T0 + 31_000);
    usePlayer.getState().next(true);
    expect(sent().map((event) => [event.type, event.track?.id])).toEqual([
      ["start", "a"],
      ["resume", "a"],
      ["pause", "a"],
      ["start", "b"],
    ]);
    expect(sent()[2].deltaMs).toBe(31_000);
  });

  it("never sends listening deltas for a podcast episode", () => {
    usePlayer.getState().playQueue([song("e", { episode: true })]);
    fire("playing");
    vi.setSystemTime(T0 + 60_000);
    fire("timeupdate");
    expect(sent().some((event) => event.deltaMs !== undefined)).toBe(false);
  });
});

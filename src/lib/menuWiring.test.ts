import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
  menuSetPlaybackState: vi.fn(async () => {}),
  listenMenuCommands: vi.fn(async () => () => {}),
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

import { dispatchMenuCommand } from "./menuCommands";
import { storeDeps } from "./menuWiring";
import { usePlayer } from "../stores/player";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });

const initial = usePlayer.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initial, true);
});

describe("menu pause", () => {
  it("pauses a playing song", () => {
    usePlayer.setState({ queue: [track(0)], index: 0, playing: true, position: 0, duration: 200 });

    storeDeps().pause();

    expect(usePlayer.getState().playing).toBe(false);
    expect(pause).toHaveBeenCalled();
  });

  it("does nothing when the song is already paused", () => {
    usePlayer.setState({ queue: [track(0)], index: 0, playing: false, position: 0, duration: 200 });
    const toggle = vi.fn();
    usePlayer.setState({ toggle });

    storeDeps().pause();

    expect(toggle).not.toHaveBeenCalled();
    expect(usePlayer.getState().playing).toBe(false);
  });

  it("runs the pause command through the dispatcher with the same rule", () => {
    usePlayer.setState({ queue: [track(0)], index: 0, playing: true, position: 0, duration: 200 });
    const deps = storeDeps();

    expect(dispatchMenuCommand("pause", deps)).toBe(true);
    expect(usePlayer.getState().playing).toBe(false);

    const toggle = vi.fn();
    usePlayer.setState({ toggle });
    dispatchMenuCommand("pause", deps);
    expect(toggle).not.toHaveBeenCalled();
  });
});

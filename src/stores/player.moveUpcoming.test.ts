import { beforeEach, describe, expect, it, vi } from "vitest";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
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

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { usePlayer } from "./player";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: "Artist", thumb: null });
const initial = usePlayer.getState();
const ids = () => usePlayer.getState().queue.map((item) => item.id);

beforeEach(() => {
  usePlayer.setState(initial, true);
  usePlayer.setState({ queue: [0, 1, 2, 3, 4].map(track), index: 1 });
});

describe("moveUpcoming", () => {
  it("reorders songs after the current one", () => {
    usePlayer.getState().moveUpcoming(2, 4);
    expect(ids()).toEqual(["t0", "t1", "t3", "t4", "t2"]);
    expect(usePlayer.getState().index).toBe(1);
  });

  it("never moves the current song or places an item before it", () => {
    usePlayer.getState().moveUpcoming(1, 3);
    usePlayer.getState().moveUpcoming(3, 0);
    usePlayer.getState().moveUpcoming(3, 1);
    expect(ids()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
  });

  it("ignores out-of-range and no-op moves", () => {
    const before = usePlayer.getState().queue;
    usePlayer.getState().moveUpcoming(2, 2);
    usePlayer.getState().moveUpcoming(2, 9);
    usePlayer.getState().moveUpcoming(9, 2);
    expect(usePlayer.getState().queue).toBe(before);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted, stored } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  stored: { value: null as unknown },
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
    getItem: async () => stored.value,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { usePlayer } from "./player";
import type { Track } from "../types";

const track: Track = { id: "t0", title: "Track 0", artist: "Artist", thumb: null };

beforeEach(() => {
  stored.value = null;
  usePlayer.setState({ queue: [], index: 0, position: 0, duration: 0, playing: false });
});

describe("player session persistence", () => {
  it("saves the duration together with the position", () => {
    usePlayer.setState({ queue: [track], position: 118, duration: 239 });
    const saved = usePlayer.persist.getOptions().partialize?.(usePlayer.getState()) as { duration?: number; position?: number };
    expect(saved.position).toBe(118);
    expect(saved.duration).toBe(239);
  });

  it("restores the duration on launch so the seek bar shows before playback", async () => {
    stored.value = {
      state: {
        queue: [track],
        index: 0,
        position: 119,
        duration: 239,
        volume: 0.8,
        muted: false,
        shuffle: false,
        repeat: "off",
        unshuffled: null,
        playingFrom: null,
        autoplayCount: 0,
      },
      version: 0,
    };
    await usePlayer.persist.rehydrate();
    expect(usePlayer.getState().position).toBe(119);
    expect(usePlayer.getState().duration).toBe(239);
    expect(playStream).not.toHaveBeenCalled();
  });
});

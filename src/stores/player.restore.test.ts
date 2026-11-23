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

import { resumeFrom, usePlayer } from "./player";
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

describe("cold start", () => {
  it("restores the queue paused at the saved position", async () => {
    stored.value = {
      state: { queue: [track], index: 0, position: 283.644, duration: 239, volume: 0.8, muted: false, shuffle: false, repeat: "off", unshuffled: null, playingFrom: null, autoplayCount: 0 },
      version: 0,
    };
    await usePlayer.persist.rehydrate();
    expect(usePlayer.getState().playing).toBe(false);
    expect(usePlayer.getState().position).toBe(283.644);
    expect(playStream).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });
});

describe("restored position", () => {
  it("applies only to the restored song, not to the one after it", async () => {
    const next: Track = { id: "t1", title: "Track 1", artist: "Artist", thumb: null };
    stored.value = {
      state: { queue: [track, next], index: 0, position: 120, duration: 239, volume: 0.8, muted: false, shuffle: false, repeat: "off", unshuffled: null, playingFrom: null, autoplayCount: 0 },
      version: 0,
    };
    await usePlayer.persist.rehydrate();
    playStream.mockResolvedValue(undefined);
    usePlayer.getState().next();
    expect(playStream).toHaveBeenLastCalledWith("t1", "Track 1", 0, expect.any(Object));
  });
});

describe("resumeFrom", () => {
  it("restarts from zero when the position is at the end", () => {
    expect(resumeFrom(274.362, 274.352)).toBe(0);
  });

  it("keeps a position in the middle of the track", () => {
    expect(resumeFrom(118, 239)).toBe(118);
  });

  it("keeps the position when the duration is unknown", () => {
    expect(resumeFrom(50, 0)).toBe(50);
  });

  it("returns zero for a non-finite position", () => {
    expect(resumeFrom(Number.NaN, 239)).toBe(0);
  });
});

describe("toggle at the end of a loaded track", () => {
  it("seeks to the start before playing", () => {
    playStream.mockResolvedValue(undefined);
    seekTo.mockClear();
    play.mockClear();
    usePlayer.getState().playQueue([track]);
    usePlayer.setState({ playing: false, position: 274.362, duration: 274.352 });
    usePlayer.getState().toggle();
    expect(seekTo).toHaveBeenCalledWith(0);
    expect(usePlayer.getState().position).toBe(0);
    expect(usePlayer.getState().playing).toBe(true);
    expect(play).toHaveBeenCalled();
  });
});

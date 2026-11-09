import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { playStream } from "../lib/audio";
import { currentTrack, usePlayer } from "./player";
import type { Track } from "../types";

const queue: Track[] = ["a", "b", "c"].map((id) => ({ id, title: `Song ${id}`, artist: "A", thumb: null }));

describe("player jumpTo", () => {
  beforeEach(() => {
    vi.mocked(playStream).mockReset().mockResolvedValue(undefined);
    usePlayer.setState({ queue, index: 0, position: 42, playing: false });
  });

  it("plays the target track and keeps the queue", () => {
    usePlayer.getState().jumpTo(2);
    const state = usePlayer.getState();
    expect(state.index).toBe(2);
    expect(state.queue).toEqual(queue);
    expect(state.position).toBe(0);
    expect(state.playing).toBe(true);
    expect(currentTrack(state)?.id).toBe("c");
    expect(playStream).toHaveBeenLastCalledWith("c", "Song c");
  });

  it("ignores targets outside the queue", () => {
    usePlayer.getState().jumpTo(5);
    usePlayer.getState().jumpTo(-1);
    expect(usePlayer.getState().index).toBe(0);
    expect(playStream).not.toHaveBeenCalled();
  });
});

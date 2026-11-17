import { afterEach, describe, expect, it, vi } from "vitest";

const { audio, setItem } = vi.hoisted(() => ({ audio: new Audio(), setItem: vi.fn() }));

vi.mock("../lib/audio", () => ({
  audio,
  playStream: vi.fn(),
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
    setItem,
    removeItem: async () => {},
  }),
}));

import { usePlayer } from "./player";

afterEach(() => {
  vi.useRealTimers();
  setItem.mockClear();
});

describe("player persistence", () => {
  it("holds position-only writes for 3 seconds and then writes the latest position", () => {
    vi.useFakeTimers();
    usePlayer.setState({ volume: 0.37 });
    setItem.mockClear();
    usePlayer.setState({ position: 10 });
    usePlayer.setState({ position: 20 });
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][1].state.position).toBe(20);
  });
});

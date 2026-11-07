import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const player = { playing: false };
  return {
    player,
    getState: vi.fn(() => player),
    subscribers: new Set<(state: typeof player, previous: typeof player) => void>(),
    subscribe: vi.fn((listener: (state: typeof player, previous: typeof player) => void) => {
      hoisted.subscribers.add(listener);
      return () => hoisted.subscribers.delete(listener);
    }),
    setTrayPlaying: vi.fn(async () => {}),
  };
});

vi.mock("../stores/player", () => ({
  usePlayer: { getState: hoisted.getState, subscribe: hoisted.subscribe },
}));

vi.mock("./bridge", () => ({
  setTrayPlaying: hoisted.setTrayPlaying,
}));

import { startTraySync } from "./traySync";

describe("tray sync", () => {
  beforeEach(() => {
    hoisted.player.playing = false;
    hoisted.setTrayPlaying.mockClear();
    hoisted.subscribers.clear();
  });

  it("tells the tray the playback state at start and on every change", () => {
    const stop = startTraySync();
    expect(hoisted.setTrayPlaying).toHaveBeenLastCalledWith(false);
    for (const listener of hoisted.subscribers) {
      listener({ ...hoisted.player, playing: true }, hoisted.player);
    }
    expect(hoisted.setTrayPlaying).toHaveBeenLastCalledWith(true);
    hoisted.setTrayPlaying.mockClear();
    for (const listener of hoisted.subscribers) {
      listener({ ...hoisted.player, playing: true }, { ...hoisted.player, playing: true });
    }
    expect(hoisted.setTrayPlaying).not.toHaveBeenCalled();
    stop();
    expect(hoisted.subscribers.size).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const player = {
    playing: false,
    toggle: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
  };
  return {
    player,
    getState: vi.fn(() => player),
    subscribers: new Set<(state: typeof player, previous: typeof player) => void>(),
    subscribe: vi.fn((listener: (state: typeof player, previous: typeof player) => void) => {
      hoisted.subscribers.add(listener);
      return () => hoisted.subscribers.delete(listener);
    }),
    listen: vi.fn(async () => () => {}),
    setTrayPlaying: vi.fn(async () => {}),
  };
});

vi.mock("../stores/player", () => ({
  usePlayer: { getState: hoisted.getState, subscribe: hoisted.subscribe },
}));

vi.mock("./bridge", () => ({
  listenMenuCommands: hoisted.listen,
  setTrayPlaying: hoisted.setTrayPlaying,
}));

import { routeMenuCommand, startMenuCommands } from "./menuCommands";

describe("menu commands", () => {
  beforeEach(() => {
    hoisted.player.playing = false;
    hoisted.player.toggle.mockClear();
    hoisted.player.next.mockClear();
    hoisted.player.prev.mockClear();
    hoisted.setTrayPlaying.mockClear();
    hoisted.subscribers.clear();
  });

  it("play-pause toggles playback", () => {
    routeMenuCommand("play-pause");
    expect(hoisted.player.toggle).toHaveBeenCalledTimes(1);
  });

  it("pause only toggles when something is playing", () => {
    routeMenuCommand("pause");
    expect(hoisted.player.toggle).not.toHaveBeenCalled();
    hoisted.player.playing = true;
    routeMenuCommand("pause");
    expect(hoisted.player.toggle).toHaveBeenCalledTimes(1);
  });

  it("next and previous move through the queue", () => {
    routeMenuCommand("next");
    routeMenuCommand("previous");
    expect(hoisted.player.next).toHaveBeenCalledWith(true);
    expect(hoisted.player.prev).toHaveBeenCalledTimes(1);
  });

  it("ignores unknown commands", () => {
    routeMenuCommand("updates");
    expect(hoisted.player.toggle).not.toHaveBeenCalled();
    expect(hoisted.player.next).not.toHaveBeenCalled();
    expect(hoisted.player.prev).not.toHaveBeenCalled();
  });

  it("tells the tray the playback state at start and on every change", () => {
    const stop = startMenuCommands();
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

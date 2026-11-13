import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { usePlayer } from "./player";
import { useSettings } from "./settings";
import type { Track } from "../types";

const song = (id: string): Track => ({ id, title: `Title ${id}`, artist: "Artist", thumb: null });

describe("duplicate queue entries", () => {
  beforeEach(() => {
    useSettings.setState({ noDuplicateQueue: false });
    usePlayer.setState({ queue: [], index: 0, playing: false, unshuffled: null, played: [], blocked: [] });
  });

  it("leaves out a song that is already waiting in the queue when the setting is off", () => {
    usePlayer.getState().playQueue([song("a"), song("b")], 0);
    const added = usePlayer.getState().addToQueue([song("b")]);
    expect(added).toBe(0);
    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["a", "b"]);
  });

  it("leaves out a song that is already playing when the setting is on", () => {
    useSettings.setState({ noDuplicateQueue: true });
    usePlayer.getState().playQueue([song("a"), song("b")], 0);
    const added = usePlayer.getState().addToQueue([song("a"), song("c")]);
    expect(added).toBe(1);
    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves out a song that is already in the queue when the setting is on", () => {
    useSettings.setState({ noDuplicateQueue: true });
    usePlayer.getState().playQueue([song("a"), song("b")], 0);
    const added = usePlayer.getState().addToQueue([song("a"), song("b"), song("c")]);
    expect(added).toBe(1);
    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["a", "b", "c"]);
  });

  it("still takes the first of two copies of the same song", () => {
    const added = usePlayer.getState().addToQueue([song("a"), song("a")]);
    expect(added).toBe(1);
    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["a"]);
  });
});

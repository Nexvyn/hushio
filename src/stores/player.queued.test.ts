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

const song = (id: string, extra: Partial<Track> = {}): Track => ({ id, title: `Title ${id}`, artist: "Artist", thumb: null, ...extra });
const ids = (tracks: Track[]) => tracks.map((track) => track.id);
const queuedIds = () => usePlayer.getState().queue.filter((track) => track.queued).map((track) => track.id);

describe("user-queued songs", () => {
  beforeEach(() => {
    useSettings.setState({ noDuplicateQueue: false });
    usePlayer.setState({ queue: [], index: 0, playing: false, unshuffled: null, played: [], blocked: [], autoplayCount: 0, shuffle: false, smartShuffle: false });
  });

  it("puts Add to queue songs right after the playing song and ahead of the context", () => {
    usePlayer.getState().playQueue([song("a"), song("b"), song("c"), song("d")], 0, "__liked__");
    usePlayer.getState().addToQueue([song("x")]);
    usePlayer.getState().addToQueue([song("y")]);
    expect(ids(usePlayer.getState().queue)).toEqual(["a", "x", "y", "b", "c", "d"]);
    expect(queuedIds()).toEqual(["x", "y"]);
  });

  it("puts Play next songs at the top of the user-queued group", () => {
    usePlayer.getState().playQueue([song("a"), song("b")], 0);
    usePlayer.getState().addToQueue([song("x")]);
    usePlayer.getState().addToQueue([song("z")], true);
    expect(ids(usePlayer.getState().queue)).toEqual(["a", "z", "x", "b"]);
    expect(queuedIds()).toEqual(["z", "x"]);
  });

  it("keeps user-queued songs ahead of the autoplay tail", () => {
    usePlayer.getState().playQueue([song("a"), song("b"), song("r1", { recommended: true })], 0);
    usePlayer.setState({ autoplayCount: 1 });
    usePlayer.getState().addToQueue([song("x")]);
    const state = usePlayer.getState();
    expect(ids(state.queue)).toEqual(["a", "x", "b", "r1"]);
    expect(state.queue.length - state.autoplayCount).toBe(3);
  });

  it("clamps a dropped position into the user-queued group", () => {
    usePlayer.getState().playQueue([song("a"), song("b"), song("c"), song("d")], 0);
    usePlayer.getState().addToQueue([song("x")]);
    usePlayer.getState().addToQueue([song("w")], false, 4);
    expect(ids(usePlayer.getState().queue)).toEqual(["a", "x", "w", "b", "c", "d"]);
    expect(queuedIds()).toEqual(["x", "w"]);
  });

  it("marks a context song queued when it is moved to the top of the upcoming list", () => {
    usePlayer.getState().playQueue([song("a"), song("b"), song("c"), song("d")], 0);
    usePlayer.getState().moveUpcoming(2, 1);
    expect(ids(usePlayer.getState().queue)).toEqual(["a", "c", "b", "d"]);
    expect(queuedIds()).toEqual(["c"]);
  });

  it("drops the flag when a queued song is dragged below the context", () => {
    usePlayer.getState().playQueue([song("a"), song("b")], 0);
    usePlayer.getState().addToQueue([song("x")]);
    usePlayer.getState().moveUpcoming(1, 2);
    expect(ids(usePlayer.getState().queue)).toEqual(["a", "b", "x"]);
    expect(queuedIds()).toEqual([]);
  });

  it("keeps user-queued songs in front when shuffle is turned on and off", () => {
    usePlayer.getState().playQueue([song("a"), song("b"), song("c"), song("d"), song("e")], 0);
    usePlayer.getState().addToQueue([song("x")]);
    usePlayer.getState().toggleShuffle();
    expect(ids(usePlayer.getState().queue).slice(0, 2)).toEqual(["a", "x"]);
    usePlayer.getState().toggleShuffle();
    expect(ids(usePlayer.getState().queue)).toEqual(["a", "x", "b", "c", "d", "e"]);
  });

  it("does not keep the queued flag on songs started from a playlist", () => {
    usePlayer.getState().playQueue([song("a", { queued: true }), song("b")], 0, "pl1");
    expect(usePlayer.getState().queue[0].queued).toBeUndefined();
  });

  it("migrates queue items saved before version 3 to context songs", () => {
    const options = usePlayer.persist.getOptions();
    expect(options.version).toBe(3);
    const saved = { queue: [song("a"), song("b", { queued: true })], smartShuffle: true } as never;
    const migrated = options.migrate?.(saved, 2) as { queue: Track[]; smartShuffle: boolean };
    expect(migrated.queue.map((track) => track.queued)).toEqual([undefined, undefined]);
    expect(migrated.smartShuffle).toBe(true);
  });
});

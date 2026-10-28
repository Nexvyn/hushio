import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  read: async (): Promise<unknown> => null,
  writes: [] as unknown[],
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: () => storage.read(),
    setItem: async (_name: string, value: unknown) => {
      storage.writes.push(value);
    },
    removeItem: async () => {},
  }),
}));

import { deletionKey } from "../lib/deletionSync";
import { DEFAULT_PINS, HISTORY_LIMIT, useLibrary } from "./library";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const initial = useLibrary.getState();
const ids = (list: { id: string }[]) => list.map((item) => item.id);

beforeEach(() => {
  storage.writes.length = 0;
  storage.read = async () => null;
  useLibrary.setState(initial, true);
});

describe("liked songs", () => {
  it("adds a song to the front and keeps its details", () => {
    useLibrary.getState().toggleLike({ ...track(1), album: "Album", duration: 200, explicit: true });
    useLibrary.getState().toggleLike(track(2));

    expect(ids(useLibrary.getState().liked)).toEqual(["t2", "t1"]);
    expect(useLibrary.getState().liked[1]).toEqual({
      id: "t1",
      title: "Track 1",
      artist: "Artist 1",
      thumb: null,
      album: "Album",
      duration: 200,
      explicit: true,
    });
  });

  it("removes a song when it is liked again", () => {
    const { toggleLike } = useLibrary.getState();
    toggleLike(track(1));
    toggleLike(track(1));

    expect(useLibrary.getState().liked).toEqual([]);
  });

  it("records an add when liked and a tombstone when unliked, with the clock moving forward", () => {
    const key = deletionKey("liked", "t1");
    useLibrary.getState().toggleLike(track(1));
    const added = useLibrary.getState().deletionSync;
    expect(added?.adds[key]).toBeGreaterThan(0);

    useLibrary.getState().toggleLike(track(1));
    const removed = useLibrary.getState().deletionSync;
    expect(removed?.adds[key]).toBeUndefined();
    expect(removed?.deletes[key]).toBeGreaterThan(added?.adds[key] ?? 0);

    useLibrary.getState().toggleLike(track(1));
    const again = useLibrary.getState().deletionSync;
    expect(again?.adds[key]).toBeGreaterThan(removed?.deletes[key] ?? 0);
  });
});

describe("listening history", () => {
  it("moves a replayed song to the front without duplicates", () => {
    const { pushHistory } = useLibrary.getState();
    pushHistory(track(1));
    pushHistory(track(2));
    pushHistory(track(1));

    expect(ids(useLibrary.getState().history)).toEqual(["t1", "t2"]);
  });

  it("keeps only the newest songs", () => {
    const { pushHistory } = useLibrary.getState();
    for (let index = 0; index < HISTORY_LIMIT + 5; index++) pushHistory(track(index));

    const history = useLibrary.getState().history;
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0].id).toBe(`t${HISTORY_LIMIT + 4}`);
  });

  it("removes one song and records the removal", () => {
    useLibrary.setState({ history: [{ ...track(1), album: null, duration: 0, explicit: false }] });
    useLibrary.getState().removeFromHistory("t1");

    expect(useLibrary.getState().history).toEqual([]);
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("history", "t1")]).toBeGreaterThan(0);
  });

  it("clears everything and records a clear for the group", () => {
    useLibrary.getState().pushHistory(track(1));
    useLibrary.getState().clearHistory();

    expect(useLibrary.getState().history).toEqual([]);
    expect(useLibrary.getState().deletionSync?.clears.history).toBeGreaterThan(0);
  });
});

describe("followed artists", () => {
  it("follows once and unfollows with a tombstone", () => {
    const artist = { id: "a1", name: "Artist 1", thumb: "https://img/1.jpg" };
    expect(useLibrary.getState().followArtist(artist)).toBe(true);
    expect(useLibrary.getState().followArtist(artist)).toBe(false);
    expect(ids(useLibrary.getState().followedArtists)).toEqual(["a1"]);

    useLibrary.getState().unfollowArtist("a1");
    expect(useLibrary.getState().followedArtists).toEqual([]);
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("followedArtists", "a1")]).toBeGreaterThan(0);
  });
});

describe("version metadata and migration", () => {
  it("persists under the library key at version 2 with the whole state", () => {
    const options = useLibrary.persist.getOptions();
    expect(options.name).toBe("library");
    expect(options.version).toBe(4);

    useLibrary.getState().toggleLike(track(1));
    expect(storage.writes.at(-1)).toMatchObject({
      version: 4,
      state: { liked: [{ id: "t1" }], pinnedSingles: DEFAULT_PINS },
    });
  });

  it("adds the default pins when an older save has none", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const migrated = migrate?.({ liked: [track(1)] }, 0);

    expect(migrated).toMatchObject({ liked: [track(1)], pinnedSingles: DEFAULT_PINS, deletionSync: undefined });
  });

  it("reads stored deletion data through the schema check", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const migrated = migrate?.({ deletionSync: { schema: 2, clock: 99 } }, 1);

    expect(migrated).toMatchObject({ pinnedSingles: DEFAULT_PINS, deletionSync: { schema: 1, clock: 0 } });
  });

  it("moves version 2 playlist track tombstones to the three-part key", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const migrated = migrate?.(
      {
        deletionSync: {
          schema: 1,
          clock: 10,
          deletes: { '["tracks","p1:t1"]': 10 },
          adds: { '["tracks","p1:t2"]': 4 },
        },
      },
      2,
    );

    expect(migrated).toMatchObject({
      deletionSync: { deletes: { '["tracks","p1","t1"]': 10 }, adds: { '["tracks","p1","t2"]': 4 } },
    });
  });
});

describe("restarting the app", () => {
  it("restores likes and history from the saved library", async () => {
    storage.read = async () => ({
      state: {
        liked: [{ ...track(7), album: null, duration: 0, explicit: false }],
        history: [{ ...track(8), album: null, duration: 0, explicit: false }],
        followedArtists: [],
        pinnedSingles: DEFAULT_PINS,
      },
      version: 1,
    });
    await useLibrary.persist.rehydrate();

    expect(ids(useLibrary.getState().liked)).toEqual(["t7"]);
    expect(ids(useLibrary.getState().history)).toEqual(["t8"]);
  });

  it("replays likes made before the saved library finished loading", async () => {
    let finish: (value: unknown) => void = () => {};
    storage.read = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    vi.resetModules();
    const { useLibrary: loading } = await import("./library");

    loading.getState().toggleLike(track(9));
    finish({
      state: {
        liked: [{ ...track(1), album: null, duration: 0, explicit: false }],
        history: [],
        followedArtists: [],
        pinnedSingles: DEFAULT_PINS,
      },
      version: 1,
    });

    await vi.waitFor(() => expect(ids(loading.getState().liked)).toEqual(["t9", "t1"]));
  });
});

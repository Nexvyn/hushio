import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { rate, love, autoDownload } = vi.hoisted(() => ({
  rate: vi.fn(async () => {}),
  love: vi.fn(async () => {}),
  autoDownload: vi.fn(async () => {}),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  ytRate: rate,
  scrobbleLove: love,
}));

vi.mock("../lib/downloads", () => ({ autoDownloadLiked: autoDownload, autoDownloadAdded: vi.fn() }));

import { deletionKey } from "../lib/deletionSync";
import { LOCAL_ID_PREFIX } from "../lib/localLibrary";
import { DEFAULT_PINS, HISTORY_LIMIT, useLibrary } from "./library";
import { GUEST_ACCOUNT, useAuth } from "./auth";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const youtube = (id: string): Track => ({ ...track(1), id });
const likedIds = () => useLibrary.getState().liked.map((item) => item.id);
const initial = useLibrary.getState();
const ids = (list: { id: string }[]) => list.map((item) => item.id);

beforeEach(() => {
  storage.writes.length = 0;
  storage.read = async () => null;
  useLibrary.setState(initial, true);
});

describe("YouTube likes", () => {
  const signIn = () => useAuth.setState({ account: { ...GUEST_ACCOUNT, mode: "google" } });

  beforeEach(() => {
    rate.mockClear();
    useAuth.setState({ account: GUEST_ACCOUNT });
  });

  it("keeps YouTube out of it while signed out", () => {
    useLibrary.getState().toggleLike(youtube("dQw4w9WgXcQ"));
    expect(rate).not.toHaveBeenCalled();
    expect(likedIds()).toContain("dQw4w9WgXcQ");
  });

  it("likes and unlikes the song on YouTube when signed in", () => {
    signIn();
    useLibrary.getState().toggleLike(youtube("dQw4w9WgXcQ"));
    expect(rate).toHaveBeenLastCalledWith("dQw4w9WgXcQ", true);
    useLibrary.getState().toggleLike(youtube("dQw4w9WgXcQ"));
    expect(rate).toHaveBeenLastCalledWith("dQw4w9WgXcQ", false);
    expect(rate).toHaveBeenCalledTimes(2);
  });

  it("skips songs that are not YouTube videos", () => {
    signIn();
    useLibrary.getState().toggleLike(youtube("net:abcdefghij"));
    useLibrary.getState().toggleLike(youtube(`${LOCAL_ID_PREFIX}abcdefghijk`));
    useLibrary.getState().toggleLike(youtube("short"));
    expect(rate).not.toHaveBeenCalled();
    expect(likedIds()).toEqual(["short", `${LOCAL_ID_PREFIX}abcdefghijk`, "net:abcdefghij"]);
  });

  it("keeps the local like when YouTube fails", async () => {
    signIn();
    rate.mockRejectedValueOnce(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useLibrary.getState().toggleLike(youtube("dQw4w9WgXcQ"));
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(likedIds()).toContain("dQw4w9WgXcQ");
    warn.mockRestore();
  });
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
      addedAt: expect.any(Number),
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

describe("bulk likes", () => {
  beforeEach(() => {
    rate.mockClear();
    love.mockClear();
    autoDownload.mockClear();
    useAuth.setState({ account: { ...GUEST_ACCOUNT, mode: "google" } });
  });

  afterEach(() => {
    useAuth.setState({ account: GUEST_ACCOUNT });
  });

  it("adds every new song in one update, newest first, and returns the count", () => {
    useLibrary.getState().toggleLike(track(0));
    const snapshots: string[][] = [];
    const unsubscribe = useLibrary.subscribe((state) => snapshots.push(ids(state.liked)));
    const added = useLibrary.getState().likeMany([track(1), track(2), track(0), track(3), track(2)]);
    unsubscribe();

    expect(added).toBe(3);
    expect(likedIds()).toEqual(["t3", "t2", "t1", "t0"]);
    expect(snapshots).toHaveLength(1);
  });

  it("skips songs that are already liked and adds nothing when all are", () => {
    useLibrary.getState().likeMany([track(1)]);
    expect(useLibrary.getState().likeMany([track(1)])).toBe(0);
    expect(likedIds()).toEqual(["t1"]);
  });

  it("records an add for each new song in the deletion sync", () => {
    useLibrary.getState().likeMany([track(1), track(2)]);
    const adds = useLibrary.getState().deletionSync?.adds ?? {};
    expect(adds[deletionKey("liked", "t1")]).toBeGreaterThan(0);
    expect(adds[deletionKey("liked", "t2")]).toBeGreaterThan(0);
  });

  it("queues a YouTube rating for each newly liked YouTube song, without scrobbling or downloading", async () => {
    useLibrary.getState().likeMany([youtube("dQw4w9WgXcQ"), track(2), youtube("aaaaaaaaaaa"), youtube("aaaaaaaaaaa")]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rate.mock.calls).toEqual([
      ["dQw4w9WgXcQ", true],
      ["aaaaaaaaaaa", true],
    ]);
    expect(love).not.toHaveBeenCalled();
    expect(autoDownload).not.toHaveBeenCalled();
    expect(likedIds()).toContain("dQw4w9WgXcQ");
  });

  it("does not rate a song that was already liked", () => {
    useLibrary.getState().toggleLike(youtube("dQw4w9WgXcQ"));
    rate.mockClear();
    useLibrary.getState().likeMany([youtube("dQw4w9WgXcQ")]);
    expect(rate).not.toHaveBeenCalled();
  });

  it("still rates, scrobbles and downloads for a single like", async () => {
    useLibrary.getState().toggleLike(youtube("dQw4w9WgXcQ"));
    expect(rate).toHaveBeenCalledWith("dQw4w9WgXcQ", true);
    expect(love).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(autoDownload).toHaveBeenCalledTimes(1));
  });
});

describe("creating a playlist with songs", () => {
  it("creates the playlist with every unique song in one update", () => {
    const snapshots: number[] = [];
    const unsubscribe = useLibrary.subscribe((state) => snapshots.push(state.playlists.length));
    const id = useLibrary.getState().createPlaylistWith("Big", [track(1), track(2), track(1)]);
    unsubscribe();

    const playlist = useLibrary.getState().playlists.find((item) => item.id === id);
    expect(playlist?.name).toBe("Big");
    expect(ids(playlist?.tracks ?? [])).toEqual(["t1", "t2"]);
    expect(snapshots).toHaveLength(1);
  });
});

describe("playlist track order", () => {
  it("replaces the tracks in one update and keeps the playlist id", () => {
    useLibrary.getState().createPlaylist("Mix");
    const id = useLibrary.getState().playlists[0].id;
    useLibrary.getState().addToPlaylist(id, track(1));
    useLibrary.getState().addToPlaylist(id, track(2));
    const before = useLibrary.getState().playlists[0].tracks;

    useLibrary.getState().setPlaylistTracks(id, [before[1], before[0]]);

    const playlist = useLibrary.getState().playlists[0];
    expect(playlist.id).toBe(id);
    expect(ids(playlist.tracks)).toEqual(["t2", "t1"]);
  });

  it("records a tombstone for removed tracks and an add for restored ones", () => {
    useLibrary.getState().createPlaylist("Mix");
    const id = useLibrary.getState().playlists[0].id;
    useLibrary.getState().addToPlaylist(id, track(1));
    useLibrary.getState().addToPlaylist(id, track(2));
    const before = useLibrary.getState().playlists[0].tracks;
    const key = deletionKey("tracks", "t2", id);

    useLibrary.getState().setPlaylistTracks(id, [before[0]]);
    expect(useLibrary.getState().deletionSync?.deletes[key]).toBeGreaterThan(0);

    useLibrary.getState().setPlaylistTracks(id, before);
    expect(useLibrary.getState().deletionSync?.adds[key]).toBeGreaterThan(0);
    expect(ids(useLibrary.getState().playlists[0].tracks)).toEqual(["t1", "t2"]);
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
    expect(options.version).toBe(7);

    useLibrary.getState().toggleLike(track(1));
    expect(storage.writes.at(-1)).toMatchObject({
      version: 7,
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

describe("date added", () => {
  it("stamps addedAt when a song joins a playlist or Liked Songs", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
    const id = useLibrary.getState().createPlaylist("Mix");
    useLibrary.getState().addToPlaylist(id, track(1));
    useLibrary.getState().toggleLike(track(2));
    vi.useRealTimers();

    const stamp = Date.parse("2026-11-03T12:00:00Z");
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.tracks[0].addedAt).toBe(stamp);
    expect(useLibrary.getState().liked[0].addedAt).toBe(stamp);
  });

  it("leaves songs saved before this version without addedAt", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const old = { id: "t1", title: "Track 1", artist: "Artist 1", thumb: null, album: null, duration: 0, explicit: false };
    const migrated = migrate?.({ liked: [old], playlists: [{ id: "p", name: "Old", folderId: null, pinned: false, tracks: [old] }] }, 4);

    expect(migrated).toMatchObject({ liked: [old], playlists: [{ tracks: [old] }] });
    expect(migrated).not.toHaveProperty("liked.0.addedAt");
  });
});

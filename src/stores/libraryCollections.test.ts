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

const queueYtJobs = vi.hoisted(() => vi.fn());

vi.mock("../lib/ytSync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ytSync")>()),
  queueYtJobs,
}));

import { deletionKey } from "../lib/deletionSync";
import { DEFAULT_PINS, type LibraryTrack, useLibrary } from "./library";
import type { Track } from "../types";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });
const library = (i: number): LibraryTrack => ({ ...track(i), album: null, duration: 180, explicit: false });
const initial = useLibrary.getState();

beforeEach(() => {
  storage.writes.length = 0;
  storage.read = async () => null;
  useLibrary.setState(initial, true);
});

function playlistNamed(name: string) {
  return useLibrary.getState().playlists.find((item) => item.name === name);
}

describe("playlists", () => {
  it("creates a playlist at the top with a trimmed name and returns its id", () => {
    const first = useLibrary.getState().createPlaylist("  Road trip  ");
    const second = useLibrary.getState().createPlaylist("Late night");

    const playlists = useLibrary.getState().playlists;
    expect(playlists.map((item) => item.id)).toEqual([second, first]);
    expect(playlists[1]).toEqual({ id: first, name: "Road trip", folderId: null, pinned: false, tracks: [] });
    expect(useLibrary.getState().deletionSync?.adds[deletionKey("playlists", first)]).toBeGreaterThan(0);
  });

  it("renames a playlist and records an edit, but ignores a blank name", () => {
    const id = useLibrary.getState().createPlaylist("Old");
    useLibrary.getState().renamePlaylist(id, "  New name ");
    expect(useLibrary.getState().playlists[0].name).toBe("New name");
    expect(useLibrary.getState().deletionSync?.edits[deletionKey("playlists", id)]).toBeGreaterThan(0);

    useLibrary.getState().renamePlaylist(id, "   ");
    expect(useLibrary.getState().playlists[0].name).toBe("New name");
  });

  it("deletes a playlist with a tombstone and keeps the songs in Liked Songs", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    useLibrary.getState().addToPlaylist(id, track(1));
    useLibrary.getState().toggleLike(track(1));
    useLibrary.getState().deletePlaylist(id);

    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useLibrary.getState().liked.map((item) => item.id)).toEqual(["t1"]);
    const sync = useLibrary.getState().deletionSync;
    expect(sync?.deletes[deletionKey("playlists", id)]).toBeGreaterThan(0);
    expect(sync?.adds[deletionKey("playlists", id)]).toBeUndefined();
  });

  it("toggles the pin on one playlist without changing the others", () => {
    const id = useLibrary.getState().createPlaylist("Pin me");
    const other = useLibrary.getState().createPlaylist("Leave me");
    useLibrary.getState().togglePinPlaylist(id);

    const playlists = useLibrary.getState().playlists;
    expect(playlists.find((item) => item.id === id)?.pinned).toBe(true);
    expect(playlists.find((item) => item.id === other)?.pinned).toBe(false);
  });

  it("adds a song once and reports a duplicate or an unknown playlist as not added", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    const { addToPlaylist } = useLibrary.getState();

    expect(addToPlaylist(id, track(1))).toBe(true);
    expect(addToPlaylist(id, track(1))).toBe(false);
    expect(addToPlaylist("missing", track(2))).toBe(false);
    expect(playlistNamed("Mix")?.tracks.map((item) => item.id)).toEqual(["t1"]);
    expect(useLibrary.getState().deletionSync?.adds[deletionKey("tracks", "t1", id)]).toBeGreaterThan(0);
  });

  it("removes a song from a playlist with a tracks tombstone", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    useLibrary.getState().addToPlaylist(id, track(1));
    useLibrary.getState().removeFromPlaylist(id, "t1");

    expect(playlistNamed("Mix")?.tracks).toEqual([]);
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("tracks", "t1", id)]).toBeGreaterThan(0);
  });

  it("moves a song inside its playlist and ignores moves past either end", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    const { addToPlaylist, moveInPlaylist } = useLibrary.getState();
    addToPlaylist(id, track(1));
    addToPlaylist(id, track(2));
    addToPlaylist(id, track(3));

    moveInPlaylist(id, 0, 2);
    expect(playlistNamed("Mix")?.tracks.map((item) => item.id)).toEqual(["t2", "t3", "t1"]);
    moveInPlaylist(id, 0, -1);
    moveInPlaylist(id, 2, 3);
    expect(playlistNamed("Mix")?.tracks.map((item) => item.id)).toEqual(["t2", "t3", "t1"]);
    expect(useLibrary.getState().deletionSync?.edits[deletionKey("playlists", id)]).toBeGreaterThan(0);
  });
});

describe("folders", () => {
  it("creates, renames and files playlists into a folder", () => {
    const folderId = useLibrary.getState().createFolder("  Chill ");
    expect(useLibrary.getState().folders).toEqual([{ id: folderId, name: "Chill" }]);
    expect(useLibrary.getState().deletionSync?.adds[deletionKey("folders", folderId)]).toBeGreaterThan(0);

    useLibrary.getState().renameFolder(folderId, "Calm");
    expect(useLibrary.getState().folders[0].name).toBe("Calm");
    expect(useLibrary.getState().deletionSync?.edits[deletionKey("folders", folderId)]).toBeGreaterThan(0);

    const playlistId = useLibrary.getState().createPlaylist("Evening");
    useLibrary.getState().setPlaylistFolder(playlistId, folderId);
    expect(playlistNamed("Evening")?.folderId).toBe(folderId);
  });

  it("ignores a move into a folder that does not exist", () => {
    const playlistId = useLibrary.getState().createPlaylist("Evening");
    useLibrary.getState().setPlaylistFolder(playlistId, "missing");
    expect(playlistNamed("Evening")?.folderId).toBeNull();
  });

  it("deletes a folder and moves its playlists back to the library root", () => {
    const folderId = useLibrary.getState().createFolder("Chill");
    const playlistId = useLibrary.getState().createPlaylist("Evening");
    useLibrary.getState().setPlaylistFolder(playlistId, folderId);
    useLibrary.getState().deleteFolder(folderId);

    expect(useLibrary.getState().folders).toEqual([]);
    expect(playlistNamed("Evening")?.folderId).toBeNull();
    const sync = useLibrary.getState().deletionSync;
    expect(sync?.deletes[deletionKey("folders", folderId)]).toBeGreaterThan(0);
    expect(sync?.edits[deletionKey("playlists", playlistId)]).toBeGreaterThan(0);
  });
});

describe("pins and order", () => {
  it("flips one collection pin and keeps the rest", () => {
    useLibrary.getState().togglePinSingle("downloads");
    expect(useLibrary.getState().pinnedSingles).toEqual({ ...DEFAULT_PINS, downloads: true });

    useLibrary.getState().togglePinSingle("liked");
    expect(useLibrary.getState().pinnedSingles.liked).toBe(false);
  });

  it("saves a copy of the row order", () => {
    const keys = ["playlist:a", "folder:b"];
    useLibrary.getState().setLibraryOrder(keys);
    keys.reverse();

    expect(useLibrary.getState().libraryOrder).toEqual(["playlist:a", "folder:b"]);
  });
});

describe("persistence and versioning", () => {
  it("writes playlists, folders and the row order with the saved state", () => {
    const folderId = useLibrary.getState().createFolder("Chill");
    const playlistId = useLibrary.getState().createPlaylist("Evening");
    useLibrary.getState().setLibraryOrder(["folder:" + folderId]);

    expect(storage.writes.at(-1)).toMatchObject({
      version: 7,
      state: {
        playlists: [{ id: playlistId, name: "Evening", folderId: null, pinned: false, tracks: [] }],
        folders: [{ id: folderId, name: "Chill" }],
        libraryOrder: ["folder:" + folderId],
      },
    });
  });

  it("restores playlists, folders and order from a version 2 save", async () => {
    vi.resetModules();
    storage.read = async () => ({
      version: 2,
      state: {
        liked: [library(1)],
        playlists: [{ id: "p1", name: "Saved", folderId: "f1", pinned: true, tracks: [library(2)] }],
        folders: [{ id: "f1", name: "Folder" }],
        libraryOrder: ["folder:f1"],
      },
    });
    const fresh = await import("./library");

    await vi.waitFor(() => expect(fresh.useLibrary.getState().playlists).toHaveLength(1));
    expect(fresh.useLibrary.getState().playlists[0]).toMatchObject({ name: "Saved", pinned: true, folderId: "f1" });
    expect(fresh.useLibrary.getState().folders).toEqual([{ id: "f1", name: "Folder" }]);
    expect(fresh.useLibrary.getState().libraryOrder).toEqual(["folder:f1"]);
  });

  it("migrates a version 1 save with empty playlists, folders and no saved order", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const migrated = migrate?.({ liked: [library(1)], pinnedSingles: DEFAULT_PINS }, 1);

    expect(migrated).toMatchObject({
      liked: [library(1)],
      playlists: [],
      folders: [],
      libraryOrder: undefined,
    });
  });
});

describe("song restore, removal and tombstones", () => {
  it("puts a restored song back at its index and clamps indexes past either end", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    const { addToPlaylist, removeFromPlaylist, restoreTrackInPlaylist } = useLibrary.getState();
    addToPlaylist(id, track(1));
    addToPlaylist(id, track(2));
    addToPlaylist(id, track(3));
    const ids = () => playlistNamed("Mix")?.tracks.map((item) => item.id);

    removeFromPlaylist(id, "t2");
    restoreTrackInPlaylist(id, library(2), 1);
    expect(ids()).toEqual(["t1", "t2", "t3"]);

    removeFromPlaylist(id, "t2");
    restoreTrackInPlaylist(id, library(2), 99);
    expect(ids()).toEqual(["t1", "t3", "t2"]);

    removeFromPlaylist(id, "t2");
    restoreTrackInPlaylist(id, library(2), -5);
    expect(ids()).toEqual(["t2", "t1", "t3"]);
    expect(useLibrary.getState().deletionSync?.adds[deletionKey("tracks", "t2", id)]).toBeGreaterThan(0);
  });

  it("queues an add on YouTube when a removed song is restored", () => {
    const id = useLibrary.getState().createPlaylist("Synced");
    const { addToPlaylist, removeFromPlaylist, restoreTrackInPlaylist } = useLibrary.getState();
    const youtube = { ...library(5), id: "dQw4w9WgXcQ" };
    addToPlaylist(id, youtube);
    removeFromPlaylist(id, youtube.id);
    queueYtJobs.mockClear();
    restoreTrackInPlaylist(id, youtube, 0);
    expect(queueYtJobs).toHaveBeenCalledWith([{ kind: "add", localPlaylistId: id, videoId: "dQw4w9WgXcQ" }]);
  });

  it("ignores a restore of a song that is already in the playlist", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    useLibrary.getState().addToPlaylist(id, track(1));
    const before = useLibrary.getState().deletionSync?.clock;

    useLibrary.getState().restoreTrackInPlaylist(id, library(1), 0);
    expect(playlistNamed("Mix")?.tracks).toHaveLength(1);
    expect(useLibrary.getState().deletionSync?.clock).toBe(before);
  });

  it("records nothing when removing a song that is not in the playlist", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    useLibrary.getState().removeFromPlaylist(id, "t9");
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("tracks", "t9", id)]).toBeUndefined();
  });

  it("drops the add stamps of the songs in a deleted playlist", () => {
    const id = useLibrary.getState().createPlaylist("Mix");
    useLibrary.getState().addToPlaylist(id, track(1));
    const key = deletionKey("tracks", "t1", id);
    expect(useLibrary.getState().deletionSync?.adds[key]).toBeGreaterThan(0);

    useLibrary.getState().deletePlaylist(id);
    expect(useLibrary.getState().deletionSync?.adds[key]).toBeUndefined();
  });

  it("ignores deleting a playlist that does not exist", () => {
    const before = useLibrary.getState().deletionSync?.clock;
    useLibrary.getState().deletePlaylist("missing");
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("playlists", "missing")]).toBeUndefined();
    expect(useLibrary.getState().deletionSync?.clock).toBe(before);
  });
});

describe("folder moves and tombstones", () => {
  it("moves a playlist back to the library root with null", () => {
    const folderId = useLibrary.getState().createFolder("Chill");
    const playlistId = useLibrary.getState().createPlaylist("Evening");
    useLibrary.getState().setPlaylistFolder(playlistId, folderId);
    useLibrary.getState().setPlaylistFolder(playlistId, null);
    expect(playlistNamed("Evening")?.folderId).toBeNull();
  });

  it("does not stamp anything when a playlist is moved into the folder it is already in", () => {
    const folderId = useLibrary.getState().createFolder("Chill");
    const playlistId = useLibrary.getState().createPlaylist("Evening");
    useLibrary.getState().setPlaylistFolder(playlistId, folderId);
    const before = useLibrary.getState().deletionSync?.clock;

    useLibrary.getState().setPlaylistFolder(playlistId, folderId);
    expect(useLibrary.getState().deletionSync?.clock).toBe(before);
  });

  it("ignores renaming a folder to a blank name or renaming one that does not exist", () => {
    const folderId = useLibrary.getState().createFolder("Chill");
    const before = useLibrary.getState().deletionSync?.clock;

    useLibrary.getState().renameFolder(folderId, "   ");
    useLibrary.getState().renameFolder("missing", "Calm");
    expect(useLibrary.getState().folders).toEqual([{ id: folderId, name: "Chill" }]);
    expect(useLibrary.getState().deletionSync?.clock).toBe(before);
  });

  it("ignores deleting a folder that does not exist", () => {
    useLibrary.getState().deleteFolder("missing");
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("folders", "missing")]).toBeUndefined();
  });

  it("drops the add stamp of a folder that is deleted but keeps its tombstone", () => {
    const folderId = useLibrary.getState().createFolder("Chill");
    useLibrary.getState().deleteFolder(folderId);
    const sync = useLibrary.getState().deletionSync;
    expect(sync?.adds[deletionKey("folders", folderId)]).toBeUndefined();
    expect(sync?.deletes[deletionKey("folders", folderId)]).toBeGreaterThan(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SavedAlbumInput, useLibrary } from "./library";

vi.mock("../lib/bridge", () => ({
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

const album: SavedAlbumInput = { id: "MPREb_1", title: "Night Drive", artist: "Kairo", thumb: "https://x/a.jpg", trackIds: ["t1", "t2"] };

beforeEach(() => {
  useLibrary.setState({ savedAlbums: [] });
});

describe("saved albums", () => {
  it("adds an album once, newest first, with a save time", () => {
    useLibrary.getState().saveAlbum(album);
    useLibrary.getState().saveAlbum({ ...album, id: "MPREb_2", title: "Second" });
    useLibrary.getState().saveAlbum(album);

    const saved = useLibrary.getState().savedAlbums;
    expect(saved.map((item) => item.id)).toEqual(["MPREb_2", "MPREb_1"]);
    expect(saved[1].savedAt).toBeTypeOf("number");
    expect(saved[1].trackIds).toEqual(["t1", "t2"]);
  });

  it("removes a saved album and records a deletion for sync", () => {
    useLibrary.getState().saveAlbum(album);
    useLibrary.getState().removeSavedAlbum("MPREb_1");

    expect(useLibrary.getState().savedAlbums).toEqual([]);
    const deletes = useLibrary.getState().deletionSync?.deletes ?? {};
    expect(Object.keys(deletes)).toContain(JSON.stringify(["savedAlbums", "MPREb_1"]));
  });

  it("ignores a remove for an album that is not saved", () => {
    useLibrary.getState().removeSavedAlbum("missing");
    expect(useLibrary.getState().savedAlbums).toEqual([]);
  });
});

describe("library version 7 migration", () => {
  it("starts saved albums empty for saves from before version 7", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const migrated = migrate?.({ playlists: [] }, 6) as { savedAlbums: unknown[] };
    expect(migrated.savedAlbums).toEqual([]);
  });

  it("keeps well-formed albums and drops malformed ones", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const good = { id: "MPREb_1", title: "One", artist: "x", savedAt: 5 };
    const migrated = migrate?.(
      { savedAlbums: [good, { id: "", title: "bad", artist: "x", savedAt: 1 }, null, { title: "no id" }] },
      7,
    ) as { savedAlbums: unknown[] };
    expect(migrated.savedAlbums).toEqual([good]);
  });
});

import { describe, expect, it } from "vitest";
import { coversOf, libraryRows, pinnedFirst, topArtist } from "./collections";
import { DEFAULT_PINS, type FollowedArtist, type Playlist } from "../stores/library";

const playlist = (id: string, extra: Partial<Playlist> = {}): Playlist => ({
  id,
  name: id,
  folderId: null,
  pinned: false,
  tracks: [],
  ...extra,
});

const artist = (id: string): FollowedArtist => ({ id, name: id, followedAt: 0 });

const base = {
  playlists: [] as Playlist[],
  folders: [],
  followedArtists: [] as FollowedArtist[],
  pinnedSingles: DEFAULT_PINS,
  libraryOrder: undefined,
};

const keys = (entries: { key: string }[]) => entries.map((entry) => entry.key);

describe("libraryRows", () => {
  it("puts pinned singles and pinned playlists first, in that order", () => {
    const rows = libraryRows({
      ...base,
      playlists: [playlist("a"), playlist("b", { pinned: true })],
    });

    expect(keys(rows.fixed)).toEqual(["single:liked", "single:spotify", "playlist:b"]);
    expect(keys(rows.movable)).toEqual(["single:downloads", "single:local", "playlist:a"]);
  });

  it("lists only unfiled playlists and reports each folder's playlist count", () => {
    const rows = libraryRows({
      ...base,
      folders: [{ id: "f", name: "Folder" }],
      playlists: [playlist("a", { folderId: "f" }), playlist("b", { folderId: "f" }), playlist("c")],
    });

    expect(keys(rows.movable)).not.toContain("playlist:a");
    expect(rows.movable.find((entry) => entry.key === "folder:f")).toMatchObject({ kind: "folder", count: 2 });
  });

  it("applies the saved order to movable rows and skips stale keys", () => {
    const rows = libraryRows({
      ...base,
      playlists: [playlist("a"), playlist("b")],
      libraryOrder: ["playlist:b", "gone", "single:local", "single:downloads", "playlist:a"],
    });

    expect(keys(rows.movable)).toEqual(["playlist:b", "single:local", "single:downloads", "playlist:a"]);
  });

  it("adds new rows in default order after their predecessor", () => {
    const rows = libraryRows({
      ...base,
      playlists: [playlist("a")],
      followedArtists: [artist("x")],
      libraryOrder: ["single:local"],
    });

    expect(keys(rows.movable)).toEqual(["single:downloads", "single:local", "playlist:a", "artist:x"]);
  });

  it("returns the followed artists as movable rows", () => {
    const rows = libraryRows({ ...base, followedArtists: [artist("x")] });
    expect(rows.movable.at(-1)).toMatchObject({ key: "artist:x", kind: "artist" });
  });
});

describe("pinnedFirst", () => {
  it("keeps the order of items that share a pin state", () => {
    const items = [
      { name: "a", pinned: false },
      { name: "b", pinned: true },
      { name: "c", pinned: false },
      { name: "d", pinned: true },
    ];
    expect(pinnedFirst(items, (item) => item.pinned).map((item) => item.name)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("coversOf and topArtist", () => {
  it("drops tracks without artwork and applies the limit", () => {
    const covers = coversOf(
      [
        { thumb: "https://i.ytimg.com/vi/a/hqdefault.jpg" },
        { thumb: null },
        { thumb: "https://i.ytimg.com/vi/b/hqdefault.jpg" },
        { thumb: "https://i.ytimg.com/vi/c/hqdefault.jpg" },
      ],
      2,
    );
    expect(covers).toHaveLength(2);
    expect(covers.every((cover) => cover.startsWith("https://"))).toBe(true);
  });

  it("returns the artist with the most songs, or null for none", () => {
    expect(topArtist([{ artist: "A" }, { artist: "B" }, { artist: "B" }])).toBe("B");
    expect(topArtist([])).toBeNull();
  });
});

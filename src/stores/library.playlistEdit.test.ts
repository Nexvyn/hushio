import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAYLIST_DESCRIPTION_MAX, type Playlist, useLibrary } from "./library";

vi.mock("../lib/bridge", () => ({
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

function playlist(overrides: Partial<Playlist> = {}): Playlist {
  return { id: "pl-1", name: "Mix", folderId: null, pinned: false, tracks: [], ...overrides };
}

beforeEach(() => {
  useLibrary.setState({ playlists: [playlist()] });
});

describe("editPlaylist", () => {
  it("sets a trimmed name, a description and a cover path", () => {
    useLibrary.getState().editPlaylist("pl-1", { name: "  Road trip  ", description: "  Long drives  ", coverPath: "/data/playlist-covers/pl-1.1.png" });
    expect(useLibrary.getState().playlists[0]).toMatchObject({
      name: "Road trip",
      description: "Long drives",
      coverPath: "/data/playlist-covers/pl-1.1.png",
    });
  });

  it("caps the description at the maximum length", () => {
    useLibrary.getState().editPlaylist("pl-1", { description: "x".repeat(PLAYLIST_DESCRIPTION_MAX + 50) });
    expect(useLibrary.getState().playlists[0].description).toHaveLength(PLAYLIST_DESCRIPTION_MAX);
  });

  it("removes the description and the cover when cleared", () => {
    useLibrary.setState({ playlists: [playlist({ description: "Old", coverPath: "/c.png" })] });
    useLibrary.getState().editPlaylist("pl-1", { description: "   ", coverPath: null });
    const saved = useLibrary.getState().playlists[0];
    expect(saved.description).toBeUndefined();
    expect(saved.coverPath).toBeUndefined();
  });

  it("ignores a blank name and keeps the old one", () => {
    useLibrary.getState().editPlaylist("pl-1", { name: "   " });
    expect(useLibrary.getState().playlists[0].name).toBe("Mix");
  });

  it("leaves fields that were not passed untouched", () => {
    useLibrary.setState({ playlists: [playlist({ description: "Keep me" })] });
    useLibrary.getState().editPlaylist("pl-1", { name: "Renamed" });
    expect(useLibrary.getState().playlists[0].description).toBe("Keep me");
  });
});

describe("library version 6 migration", () => {
  it("sanitises description and cover fields from older saves", () => {
    const migrate = useLibrary.persist.getOptions().migrate;
    const migrated = migrate?.(
      {
        playlists: [playlist({ description: "y".repeat(400), coverPath: "" }), playlist({ id: "pl-2", coverPath: "/a.jpg" })],
      },
      5,
    ) as { playlists: Playlist[] };
    expect(migrated.playlists[0].description).toHaveLength(PLAYLIST_DESCRIPTION_MAX);
    expect(migrated.playlists[0].coverPath).toBeUndefined();
    expect(migrated.playlists[1].coverPath).toBe("/a.jpg");
    expect(migrated.playlists[1].description).toBeUndefined();
  });
});

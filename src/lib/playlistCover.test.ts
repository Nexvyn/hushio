import { describe, expect, it, vi } from "vitest";
import type { Playlist } from "../stores/library";
import { playlistCovers } from "./playlistCover";

vi.mock("./bridge", () => ({
  fileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const base: Playlist = { id: "pl", name: "Mix", folderId: null, pinned: false, tracks: [] };
const withArt = (id: string) => ({
  id,
  title: id,
  artist: "A",
  album: null,
  duration: 200,
  explicit: false,
  thumb: `https://lh3.googleusercontent.com/${id}=s120`,
});

describe("playlistCovers", () => {
  it("uses the custom cover ahead of the track covers", () => {
    const covers = playlistCovers({ ...base, coverPath: "C:/data/playlist-covers/pl.1.png", tracks: [withArt("a")] });
    expect(covers).toEqual([`http://asset.localhost/${encodeURIComponent("C:/data/playlist-covers/pl.1.png")}`]);
  });

  it("falls back to the track covers when the custom cover failed to load", () => {
    const path = "C:/data/playlist-covers/pl.1.png";
    const failed = { [`http://asset.localhost/${encodeURIComponent(path)}`]: true as const };
    const covers = playlistCovers({ ...base, coverPath: path, tracks: [withArt("a")] }, 1, failed);
    expect(covers[0]).toContain("https://lh3.googleusercontent.com/a");
  });

  it("falls back to the track covers when there is no custom cover", () => {
    const covers = playlistCovers({ ...base, tracks: [withArt("a"), withArt("b")] }, 1);
    expect(covers).toHaveLength(1);
    expect(covers[0]).toContain("https://lh3.googleusercontent.com/a");
  });
});

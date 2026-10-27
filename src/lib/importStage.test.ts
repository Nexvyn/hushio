import { beforeEach, describe, expect, it, vi } from "vitest";

const { readPublicPlaylist } = vi.hoisted(() => ({ readPublicPlaylist: vi.fn() }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("./importSpotify", () => ({ readPublicPlaylist }));

import {
  importFromText,
  importPlaylistFile,
  pendingImport,
  saveImportedPlaylist,
  stageImport,
} from "./importStage";
import type { SearchSong } from "./searchParse";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();
const toast = vi.fn();

const playlist = (name: string) => ({ name, songs: [], total: 0, fromSpotify: false });

function song(id: string): SearchSong {
  return {
    id,
    title: `Title ${id}`,
    artist: "Artist",
    thumb: null,
    album: null,
    duration: 180,
    explicit: false,
    isVideo: false,
    artistId: null,
    albumId: null,
  };
}

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  readPublicPlaylist.mockReset();
  toast.mockClear();
  useUI.setState({ toast });
});

describe("staging", () => {
  it("returns an id that resolves to the staged playlist", () => {
    const id = stageImport(playlist("Mine"));
    expect(pendingImport(id)?.name).toBe("Mine");
    expect(pendingImport("import-missing")).toBeNull();
  });

  it("keeps only the newest ten imports", () => {
    const ids = Array.from({ length: 11 }, (_, index) => stageImport(playlist(`P${index}`)));
    expect(pendingImport(ids[0])).toBeNull();
    expect(pendingImport(ids[1])?.name).toBe("P1");
    expect(pendingImport(ids[10])?.name).toBe("P10");
  });
});

describe("importFromText", () => {
  it("does nothing for blank text", async () => {
    expect(await importFromText("   ")).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it("stages a pasted list under the given name", async () => {
    const id = await importFromText("Artist - One\nArtist - Two", "Road");
    expect(id).not.toBeNull();
    const staged = pendingImport(id ?? "");
    expect(staged).toMatchObject({ name: "Road", total: 2, fromSpotify: false });
    expect(staged?.songs.map((item) => item.title)).toEqual(["One", "Two"]);
  });

  it("stages the count of CSV rows that could not be read", async () => {
    const id = await importFromText('title,artist\n"Broken,Nobody\nReal,Someone', "Road");
    expect(pendingImport(id ?? "")).toMatchObject({ malformed: 1, total: 1 });
  });

  it("reports text with no songs", async () => {
    expect(await importFromText("# only a comment")).toBeNull();
    expect(toast).toHaveBeenCalledWith(
      "No songs found. Paste a playlist link, or one song per line (Artist - Title).",
      "error",
    );
  });

  it("reads a playlist link through the public reader", async () => {
    readPublicPlaylist.mockResolvedValue({ name: "Spotify mix", songs: [{ title: "T", artist: "A", duration: 60 }], total: 1, thumb: null });
    const id = await importFromText("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    expect(toast).toHaveBeenCalledWith("Reading the playlist…");
    expect(pendingImport(id ?? "")).toMatchObject({ name: "Spotify mix", fromSpotify: true, total: 1 });
  });

  it("shows the reader's error, or a fallback when it has no message", async () => {
    readPublicPlaylist.mockRejectedValueOnce(new Error("That playlist is private or no longer exists."));
    expect(await importFromText("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That playlist is private or no longer exists.", "error");

    readPublicPlaylist.mockRejectedValueOnce(new Error(""));
    expect(await importFromText("https://spotify.link/AbC123")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("Couldn't read that playlist.", "error");
  });
});

describe("saving to the library", () => {
  it("creates a playlist with the matched songs", () => {
    const id = saveImportedPlaylist("Matched", [song("a"), song("b"), song("a")]);
    const saved = useLibrary.getState().playlists.find((item) => item.id === id);
    expect(saved?.name).toBe("Matched");
    expect(saved?.tracks.map((track) => track.id)).toEqual(["a", "b"]);
  });
});

describe("importing a playlist file", () => {
  it("reports a file without YouTube songs and creates nothing", () => {
    expect(importPlaylistFile("#EXTM3U\n/local/file.mp3", "Local")).toBeNull();
    expect(toast).toHaveBeenCalledWith("No YouTube Music songs found in that file", "error");
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });

  it("creates a new playlist and reports the count", () => {
    const text = JSON.stringify({
      format: "hushio-playlist",
      name: "Shared",
      tracks: [{ id: "dQw4w9WgXcQ", title: "One", artist: "A" }, { id: "aaaaaaaaaaa", title: "Two", artist: "B" }],
    });
    const id = importPlaylistFile(text, "fallback");
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.tracks).toHaveLength(2);
    expect(toast).toHaveBeenCalledWith("Imported 2 songs", "success");
  });

  it("mentions songs that were skipped", () => {
    const text = `#PLAYLIST:Mixed\n#EXTINF:-1,A - One\nhttps://youtu.be/dQw4w9WgXcQ\n/local/two.mp3\n`;
    importPlaylistFile(text, "fallback");
    expect(toast).toHaveBeenCalledWith("Imported 1 song (1 without a YouTube link were skipped)", "success");
  });
});

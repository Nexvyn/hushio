import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSpotifyLink, getPlaylistPage, getRadio, readAppleCollection } = vi.hoisted(() => ({
  readSpotifyLink: vi.fn(),
  getPlaylistPage: vi.fn(),
  getRadio: vi.fn(),
  readAppleCollection: vi.fn(),
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("./importSpotify", () => ({ readSpotifyLink }));
vi.mock("./importApple", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./importApple")>()),
  readAppleCollection,
}));
vi.mock("./browse", () => ({ getPlaylistPage }));
vi.mock("./innertube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./innertube")>()),
  getRadio,
}));

import {
  importFromText,
  importPlaylistFile,
  pendingImport,
  saveImportedPlaylist,
  stageImport,
} from "./importStage";
import { MAX_SONGS } from "./importParse";
import type { SearchSong } from "./searchParse";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();
const toast = vi.fn(() => 7);
const dismissToast = vi.fn();

const playlist = (name: string) => ({ name, songs: [], total: 0, fromSpotify: false });

const seedInfo = { title: "Seed Song", artist: "Seed Artist", artistId: null, thumb: null, duration: 215 };
const radioItem = (id: string, title: string, duration = 200) => ({
  id,
  title,
  artist: "A",
  thumb: null,
  artistId: null,
  duration,
  explicit: false,
  videoType: "song" as const,
});
const radioPage = (items: ReturnType<typeof radioItem>[], seed: typeof seedInfo | null = seedInfo) => ({
  items,
  seed,
  continuation: null,
});

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
  readSpotifyLink.mockReset();
  getPlaylistPage.mockReset();
  getRadio.mockReset();
  toast.mockClear();
  dismissToast.mockClear();
  useUI.setState({ toast, dismissToast });
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
    readSpotifyLink.mockResolvedValue({ name: "Spotify mix", songs: [{ title: "T", artist: "A", duration: 60 }], total: 1, thumb: null });
    const id = await importFromText("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    expect(toast).toHaveBeenCalledWith("Reading the playlist…");
    expect(pendingImport(id ?? "")).toMatchObject({ name: "Spotify mix", fromSpotify: true, total: 1 });
  });

  it("reads an Apple Music link through the Apple reader", async () => {
    readAppleCollection.mockResolvedValue({
      name: "Apple mix",
      songs: [{ title: "T", artist: "A", duration: 60 }],
      total: 1,
      thumb: null,
    });
    const id = await importFromText("https://music.apple.com/us/playlist/pl.abc123");
    expect(readAppleCollection).toHaveBeenCalledWith("https://music.apple.com/us/playlist/pl.abc123");
    expect(pendingImport(id ?? "")).toMatchObject({ name: "Apple mix", total: 1 });
  });

  it("shows a toast when the Apple reader fails", async () => {
    readAppleCollection.mockRejectedValueOnce(new Error("That playlist is private or no longer exists."));
    expect(await importFromText("https://music.apple.com/us/playlist/pl.abc123")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That playlist is private or no longer exists.", "error");
  });

  it("shows the reader's error, or a fallback when it has no message", async () => {    readSpotifyLink.mockRejectedValueOnce(new Error("That playlist is private or no longer exists."));
    expect(await importFromText("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That playlist is private or no longer exists.", "error");

    readSpotifyLink.mockRejectedValueOnce(new Error(""));
    expect(await importFromText("https://spotify.link/AbC123")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("Couldn't read that playlist.", "error");
  });
});

describe("importing a YouTube playlist link", () => {
  const remote = (id: string) => ({ ...song(id), id, duration: 200, thumb: null });
  const page = (title: string, tracks: SearchSong[]) => ({
    title,
    credit: "",
    year: null,
    thumb: null,
    tracks,
    continuation: null,
    meta: "",
  });

  it("saves every track as a local playlist named after the playlist, without matching", async () => {
    getPlaylistPage.mockResolvedValue(page("Road Trip", [remote("aaaaaaaaaaa"), remote("bbbbbbbbbbb")]));
    const id = await importFromText("https://music.youtube.com/playlist?list=PLroad");

    expect(getPlaylistPage).toHaveBeenCalledWith("PLroad");
    expect(readSpotifyLink).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Reading the playlist…");
    const saved = useLibrary.getState().playlists.find((item) => item.id === id);
    expect(saved?.name).toBe("Road Trip");
    expect(saved?.tracks.map((track) => track.id)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(pendingImport(id ?? "")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("Saved “Road Trip” to your library", "success");
  });

  it("uses the default name when the playlist has no title", async () => {
    getPlaylistPage.mockResolvedValue(page("", [remote("aaaaaaaaaaa")]));
    const id = await importFromText("https://youtu.be/dQw4w9WgXcQ?list=PLuntitled");
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.name).toBe("Imported playlist");
  });

  it("caps the saved songs at the import limit", async () => {
    const tracks = Array.from({ length: MAX_SONGS + 3 }, (_, index) => remote(`id${index}`));
    getPlaylistPage.mockResolvedValue(page("Long", tracks));
    const id = await importFromText("https://www.youtube.com/playlist?list=PLlong");
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.tracks).toHaveLength(MAX_SONGS);
  }, 60_000);

  it("saves the whole list of a long playlist that the reader collected from every page", async () => {
    const tracks = Array.from({ length: 300 }, (_, index) => remote(`long${index}`));
    getPlaylistPage.mockResolvedValue(page("Long", tracks));
    const id = await importFromText("https://www.youtube.com/playlist?list=PLlong");
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.tracks).toHaveLength(300);
  });

  it("reports a failed read as an error and saves nothing", async () => {
    getPlaylistPage.mockRejectedValueOnce(new Error("private"));
    expect(await importFromText("https://www.youtube.com/playlist?list=PLprivate")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("Couldn't read that playlist. Check the link is public.", "error");
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });

  it("reports an empty playlist as an error and saves nothing", async () => {
    getPlaylistPage.mockResolvedValue(page("Nothing", []));
    expect(await importFromText("https://www.youtube.com/playlist?list=PLempty")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That playlist has no songs.", "error");
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });

  it("imports a YouTube Mix link as a snapshot of the mix, not a playlist", async () => {
    getRadio.mockResolvedValue(
      radioPage([radioItem("aaaaaaaaaaa", "Next"), radioItem("bbbbbbbbbbb", "Later", 240), radioItem("aaaaaaaaaaa", "Next")]),
    );
    const id = await importFromText("https://www.youtube.com/watch?v=7eKJFnvYfOE&list=RD7eKJFnvYfOE&start_radio=1");

    expect(getPlaylistPage).not.toHaveBeenCalled();
    expect(readSpotifyLink).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Reading the mix…");
    expect(getRadio).toHaveBeenCalledTimes(1);
    expect(getRadio).toHaveBeenCalledWith("7eKJFnvYfOE");
    const saved = useLibrary.getState().playlists.find((item) => item.id === id);
    expect(saved?.name).toBe("Seed Song Mix");
    expect(saved?.tracks.map((track) => track.id)).toEqual(["7eKJFnvYfOE", "aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(saved?.tracks.map((track) => track.duration)).toEqual([215, 200, 240]);
    expect(toast).toHaveBeenLastCalledWith("Saved “Seed Song Mix” to your library", "success");
  });

  it("names a mix YouTube Mix when the seed is missing, for a music.youtube.com RDAMVM link", async () => {
    getRadio.mockResolvedValue(radioPage([radioItem("aaaaaaaaaaa", "Next")], null));
    const id = await importFromText("https://music.youtube.com/watch?list=RDAMVM7eKJFnvYfOE");

    expect(getRadio).toHaveBeenCalledWith("7eKJFnvYfOE");
    const saved = useLibrary.getState().playlists.find((item) => item.id === id);
    expect(saved?.name).toBe("YouTube Mix");
    expect(saved?.tracks.map((track) => track.id)).toEqual(["aaaaaaaaaaa"]);
  });

  it("keeps at most fifty mix songs", async () => {
    getRadio.mockResolvedValue(radioPage(Array.from({ length: 80 }, (_, index) => radioItem(`id${index}`, `T${index}`))));
    const id = await importFromText("https://www.youtube.com/watch?v=7eKJFnvYfOE&list=RD7eKJFnvYfOE");
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.tracks).toHaveLength(50);
  });

  it("reports a mix with no songs and saves nothing", async () => {
    getRadio.mockResolvedValue(null);
    expect(await importFromText("https://www.youtube.com/watch?v=7eKJFnvYfOE&list=RD7eKJFnvYfOE")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That mix has no songs.", "error");
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });

  it("reports a failed mix read as an error and saves nothing", async () => {
    getRadio.mockRejectedValue(new Error("offline"));
    expect(await importFromText("https://www.youtube.com/watch?v=7eKJFnvYfOE&list=RD7eKJFnvYfOE")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("Couldn't read that mix.", "error");
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });

  it("reads an RDCLAK album id through the playlist reader", async () => {
    const album = "RDCLAK5uy_kmPRjHDECIcuVwnKVcg1Vkn1f8VbGPoEY";
    getPlaylistPage.mockResolvedValue({ title: "Album", credit: "", year: null, thumb: null, tracks: [song("aaaaaaaaaaa")], continuation: null, meta: "" });
    const id = await importFromText(`https://music.youtube.com/playlist?list=${album}`);
    expect(getPlaylistPage).toHaveBeenCalledWith(album);
    expect(getRadio).not.toHaveBeenCalled();
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.name).toBe("Album");
  });

  it("never sends a YouTube link that is not a playlist or mix to the song-list parser", async () => {
    expect(await importFromText("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That link isn't a playlist.", "error");
    expect(await importFromText("youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(toast).toHaveBeenLastCalledWith("That link isn't a playlist.", "error");
    expect(getPlaylistPage).not.toHaveBeenCalled();
    expect(getRadio).not.toHaveBeenCalled();
    expect(useLibrary.getState().playlists).toHaveLength(0);
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
    expect(toast).toHaveBeenCalledWith("No songs found in that file", "error");
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

describe("loading toast", () => {
  const MIX_URL = "https://www.youtube.com/watch?v=7eKJFnvYfOE&list=RD7eKJFnvYfOE";
  const PLAYLIST_URL = "https://music.youtube.com/playlist?list=PLroad";

  it("is dismissed when a YouTube playlist is saved", async () => {
    getPlaylistPage.mockResolvedValueOnce({ title: "Road", tracks: [song("aaaaaaaaaaa")] });
    await importFromText(PLAYLIST_URL);
    expect(toast).toHaveBeenCalledWith("Reading the playlist…");
    expect(dismissToast).toHaveBeenCalledWith(7);
  });

  it("is dismissed when a YouTube playlist read fails", async () => {
    getPlaylistPage.mockRejectedValueOnce(new Error("private"));
    await importFromText(PLAYLIST_URL);
    expect(dismissToast).toHaveBeenCalledWith(7);
    expect(toast).toHaveBeenLastCalledWith("Couldn't read that playlist. Check the link is public.", "error");
  });

  it("is dismissed when a YouTube playlist has no songs", async () => {
    getPlaylistPage.mockResolvedValueOnce({ title: "Empty", tracks: [] });
    await importFromText(PLAYLIST_URL);
    expect(dismissToast).toHaveBeenCalledWith(7);
    expect(toast).toHaveBeenLastCalledWith("That playlist has no songs.", "error");
  });

  it("is dismissed when a mix is saved, fails to read or is empty", async () => {
    getRadio.mockResolvedValueOnce(radioPage([radioItem("aaaaaaaaaaa", "Next")]));
    await importFromText(MIX_URL);
    expect(toast).toHaveBeenCalledWith("Reading the mix…");
    expect(dismissToast).toHaveBeenLastCalledWith(7);

    getRadio.mockRejectedValueOnce(new Error("offline"));
    await importFromText(MIX_URL);
    expect(dismissToast).toHaveBeenCalledTimes(2);
    expect(toast).toHaveBeenLastCalledWith("Couldn't read that mix.", "error");

    getRadio.mockResolvedValueOnce(radioPage([], null));
    await importFromText(MIX_URL);
    expect(dismissToast).toHaveBeenCalledTimes(3);
    expect(toast).toHaveBeenLastCalledWith("That mix has no songs.", "error");
  });

  it("is dismissed when a Spotify playlist read fails", async () => {
    readSpotifyLink.mockRejectedValueOnce(new Error("private"));
    await importFromText("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    expect(dismissToast).toHaveBeenCalledWith(7);
  });
});

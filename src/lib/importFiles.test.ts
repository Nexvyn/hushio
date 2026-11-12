import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRadio } = vi.hoisted(() => ({ getRadio: vi.fn() }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("./importSpotify", () => ({ readSpotifyLink: vi.fn() }));
vi.mock("./browse", () => ({ getPlaylistPage: vi.fn() }));
vi.mock("./innertube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./innertube")>()),
  getRadio,
}));

import { importFiles, pendingImport } from "./importStage";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";
import { useNavigation } from "../stores/navigation";

const initialLibrary = useLibrary.getState();

const ROAD = [
  "Video ID,Playlist Video Creation Timestamp",
  "dQw4w9WgXcQ,2023-01-02T03:04:05+00:00",
  "jNQXAC9IVRw,2023-01-03T03:04:05+00:00",
  "bad,2023-01-04T03:04:05+00:00",
].join("\n");

const LIKED = ["Video ID,Playlist Video Creation Timestamp", "9bZkp7q19f0,", "kJQP7kiw5Fk,"].join("\n");

const LIBRARY = [
  "Video ID,Song Title,Album Title,Artist Name 1",
  "fJ9rUzIMcZQ,Bohemian Rhapsody,A Night at the Opera,Queen",
].join("\n");

const INDEX = ["Playlist ID,Playlist Title (Original)", "PLx1,Workout Mix"].join("\n");

const jsonPlaylist = (name: string) =>
  JSON.stringify({
    format: "hushio-playlist",
    name,
    tracks: [{ id: "dQw4w9WgXcQ", title: "Song", artist: "Band" }],
  });

const radioSeed = (id: string) => ({
  items: [],
  seed: { title: `Title ${id}`, artist: "Artist", artistId: null, thumb: null, duration: 200 },
  continuation: null,
});

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  useUI.setState({ toasts: [], pendingToasts: [] });
  useNavigation.setState({ view: { name: "import" }, navPast: [], navFuture: [] });
  getRadio.mockReset();
  getRadio.mockImplementation(async (id: string) => (id === "bad" ? null : radioSeed(id)));
});

describe("importFiles with Google Takeout files", () => {
  it("saves each playlist, likes the liked songs and reports one summary", async () => {
    const toast = vi.spyOn(useUI.getState(), "toast");
    const id = await importFiles([
      { name: "Road trip-videos.csv", text: ROAD },
      { name: "Liked music-videos.csv", text: LIKED },
      { name: "music library songs.csv", text: LIBRARY },
      { name: "playlists.csv", text: INDEX },
    ]);

    const library = useLibrary.getState();
    expect(library.playlists.map((playlist) => playlist.name)).toEqual(["Road trip"]);
    expect(library.playlists[0].id).toBe(id);
    expect(library.playlists[0].tracks.map((track) => track.id)).toEqual(["dQw4w9WgXcQ", "jNQXAC9IVRw"]);
    expect(library.liked.map((track) => track.id).sort()).toEqual(["9bZkp7q19f0", "fJ9rUzIMcZQ", "kJQP7kiw5Fk"].sort());
    expect(library.liked.find((track) => track.id === "fJ9rUzIMcZQ")).toMatchObject({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      album: "A Night at the Opera",
    });

    const messages = toast.mock.calls.map((call) => call[0]);
    expect(messages).toContain("Reading 4 of 4 songs…");
    expect(messages.at(-1)).toBe("Imported 1 playlist and 3 liked songs (1 song skipped)");
    expect(toast.mock.calls.at(-1)?.[1]).toBe("success");
    toast.mockRestore();
  });

  it("names a playlist after the playlists.csv title when the file is named by its id", async () => {
    await importFiles([
      { name: "PLx1.csv", text: ROAD },
      { name: "playlists.csv", text: INDEX },
    ]);
    expect(useLibrary.getState().playlists.map((playlist) => playlist.name)).toEqual(["Workout Mix"]);
  });

  it("counts several playlists in the summary", async () => {
    const id = await importFiles([
      { name: "First-videos.csv", text: ROAD },
      { name: "Second-videos.csv", text: ROAD },
    ]);
    expect(useLibrary.getState().playlists.map((playlist) => playlist.name).sort()).toEqual(["First", "Second"]);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Imported 2 playlists (2 songs skipped)");
    expect(id).toBeTruthy();
  });

  it("does not like a song that is already liked", async () => {
    useLibrary.getState().toggleLike({ id: "9bZkp7q19f0", title: "Done", artist: "A", thumb: "", duration: 0 });
    await importFiles([{ name: "Liked music-videos.csv", text: LIKED }]);
    expect(useLibrary.getState().liked.filter((track) => track.id === "9bZkp7q19f0")).toHaveLength(1);
  });

  it("likes a Takeout liked file through likeMany, never through toggleLike", async () => {
    const likeMany = vi.fn(useLibrary.getState().likeMany);
    const toggleLike = vi.fn();
    useLibrary.setState({ likeMany, toggleLike });
    await importFiles([{ name: "Liked music-videos.csv", text: LIKED }]);
    expect(likeMany).toHaveBeenCalledTimes(1);
    expect(likeMany.mock.calls[0][0].map((track) => track.id)).toEqual(["9bZkp7q19f0", "kJQP7kiw5Fk"]);
    expect(toggleLike).not.toHaveBeenCalled();
    expect(useLibrary.getState().liked.map((track) => track.id)).toEqual(["kJQP7kiw5Fk", "9bZkp7q19f0"]);
  });

  it("reports when no song in the files can be read", async () => {
    await importFiles([{ name: "Empty-videos.csv", text: "Video ID,Playlist Video Creation Timestamp\nbad,x" }]);
    expect(useUI.getState().toasts.at(-1)).toMatchObject({ message: "No songs found in those files.", kind: "error" });
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });
});

describe("importFiles with other files", () => {
  it("stages a single Exportify Liked_Songs file under the name Liked Songs", async () => {
    const text = "Track URI,Track Name,Album Name,Artist Name(s),Track Duration (ms)\nspotify:track:1,Song,Album,\"A, B\",200000";
    const id = await importFiles([{ name: "Liked_Songs.csv", text }]);
    expect(id).not.toBeNull();
    expect(pendingImport(id ?? "")).toMatchObject({ name: "Liked Songs", fromSpotify: false });
    expect(pendingImport(id ?? "")?.songs[0]).toMatchObject({ title: "Song", artist: "A, B" });
  });

  it("saves JSON and M3U files in a batch and skips text lists that need matching", async () => {
    await importFiles([
      { name: "one.json", text: jsonPlaylist("One") },
      { name: "two.json", text: jsonPlaylist("Two") },
      { name: "Favourites.txt", text: "Artist - Song" },
    ]);
    expect(useLibrary.getState().playlists.map((playlist) => playlist.name).sort()).toEqual(["One", "Two"]);
    expect(useUI.getState().toasts.at(-1)?.message).toBe(
      "Imported 2 playlists. Text lists need matching, so import them one at a time.",
    );
  });
});

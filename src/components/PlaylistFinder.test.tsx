import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Playlist } from "../stores/library";
import { useLibrary } from "../stores/library";
import type { SearchRow, SearchSong } from "../lib/searchParse";
import { cachedSearchPage } from "../lib/search";
import { FINDER_MAX_SONGS, PlaylistFinder, songsFromRows } from "./PlaylistFinder";

vi.mock("../lib/bridge", async () => ({
  ...(await vi.importActual<typeof import("../lib/bridge")>("../lib/bridge")),
  persistRead: vi.fn(async () => null),
  persistWrite: vi.fn(async () => true),
}));

vi.mock("../lib/search", () => ({
  cachedSearchPage: vi.fn(),
}));

const song = (id: string, title = `Song ${id}`): SearchSong => ({
  id,
  title,
  artist: "Artist",
  thumb: null,
  artistId: null,
  albumId: null,
  album: null,
  duration: 200,
  explicit: false,
  isVideo: false,
});

const playlist: Playlist = { id: "pl-1", name: "Mix", folderId: null, pinned: false, tracks: [] };

beforeEach(() => {
  useLibrary.setState({ playlists: [playlist] });
  vi.mocked(cachedSearchPage).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("songsFromRows", () => {
  it("keeps track and top rows once each and skips browse rows", () => {
    const rows: SearchRow[] = [
      { kind: "track", track: song("a") },
      { kind: "top", song: song("a") },
      { kind: "top", song: song("b") },
      { kind: "browse", item: { type: "album", browseId: "x", title: "Album", subtitle: "", thumb: null } },
    ];
    expect(songsFromRows(rows).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("collapses to the list view at five songs", () => {
    expect(FINDER_MAX_SONGS).toBe(5);
  });
});

describe("PlaylistFinder", () => {
  it("searches songs after typing and adds one to the playlist", async () => {
    vi.mocked(cachedSearchPage).mockResolvedValue({ rows: [{ kind: "track", track: song("s1", "Golden Hour") }], continuation: null });
    render(<PlaylistFinder playlist={playlist} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search songs to add" }), { target: { value: "golden" } });
    await waitFor(() => expect(screen.getByText("Golden Hour")).toBeTruthy());
    expect(cachedSearchPage).toHaveBeenCalledWith("golden", "songs");

    fireEvent.click(screen.getByRole("button", { name: "Add Golden Hour to Mix" }));
    expect(useLibrary.getState().playlists[0].tracks.map((track) => track.id)).toEqual(["s1"]);
    expect(await screen.findByRole("button", { name: "Golden Hour is in the playlist" })).toBeTruthy();
  });

  it("shows an empty state when nothing matches", async () => {
    vi.mocked(cachedSearchPage).mockResolvedValue({ rows: [], continuation: null });
    render(<PlaylistFinder playlist={playlist} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzqx" } });
    expect(await screen.findByText(/No songs found for "zzqx"/)).toBeTruthy();
  });

  it("shows an error with a retry that searches again", async () => {
    vi.mocked(cachedSearchPage)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ rows: [{ kind: "track", track: song("s2", "Retry Song") }], continuation: null });
    render(<PlaylistFinder playlist={playlist} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "retry" } });
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Retry Song")).toBeTruthy();
  });

  it("clears the text with the single clear button", () => {
    render(<PlaylistFinder playlist={playlist} />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input.value).toBe("");
  });
});

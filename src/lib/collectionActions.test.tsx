import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("./downloadText", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./downloadText")>()),
  downloadText: vi.fn(),
}));

import { Dialog } from "../components/Dialog";
import { downloadText } from "./downloadText";
import {
  openCreateFolder,
  openCreatePlaylist,
  openDeletePlaylist,
  openRenameFolder,
  openRenamePlaylist,
  playlistHeaderItems,
  queueName,
  removePlaylistDuplicates,
  saveQueueAsPlaylist,
  sortPlaylistBy,
  sortTracks,
} from "./collectionActions";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

const roadTrip: Playlist = { id: "p1", name: "Road trip", folderId: null, pinned: false, tracks: [] };

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState(initialNavigation, true);
  useUI.setState({ ...initialUI, dialog: null }, true);
});

afterEach(cleanup);

function openDialog(open: () => void) {
  render(<Dialog />);
  act(() => open());
}

describe("create playlist dialog", () => {
  it("creates the playlist with the typed name and opens it", () => {
    openDialog(openCreatePlaylist);
    const input = screen.getByPlaceholderText("Playlist name") as HTMLInputElement;
    expect(input.value).toBe("My Playlist #1");

    fireEvent.change(input, { target: { value: "  Road trip " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = useLibrary.getState().playlists;
    expect(created.map((item) => item.name)).toEqual(["Road trip"]);
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: created[0].id });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses the suggested name when the field is blank", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(openCreatePlaylist);
    fireEvent.change(screen.getByPlaceholderText("Playlist name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(useLibrary.getState().playlists.map((item) => item.name)).toEqual(["My Playlist #2", "Road trip"]);
  });

  it("creates on Enter", () => {
    openDialog(openCreatePlaylist);
    const input = screen.getByPlaceholderText("Playlist name");
    fireEvent.change(input, { target: { value: "Late night" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useLibrary.getState().playlists.map((item) => item.name)).toEqual(["Late night"]);
  });

  it("creates nothing when cancelled", () => {
    openDialog(openCreatePlaylist);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useUI.getState().dialog).toBeNull();
  });
});

describe("rename and folder dialogs", () => {
  it("renames a playlist from its current name", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(() => openRenamePlaylist("p1"));
    const input = screen.getByPlaceholderText("Playlist name") as HTMLInputElement;
    expect(input.value).toBe("Road trip");

    fireEvent.change(input, { target: { value: "Trip" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(useLibrary.getState().playlists[0].name).toBe("Trip");
  });

  it("keeps the name when the rename is left blank", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(() => openRenamePlaylist("p1"));
    fireEvent.change(screen.getByPlaceholderText("Playlist name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useLibrary.getState().playlists[0].name).toBe("Road trip");
  });

  it("creates a folder with the typed name", () => {
    openDialog(openCreateFolder);
    fireEvent.change(screen.getByPlaceholderText("Folder name"), { target: { value: "Chill" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(useLibrary.getState().folders.map((item) => item.name)).toEqual(["Chill"]);
  });

  it("renames a folder", () => {
    useLibrary.setState({ folders: [{ id: "f1", name: "Chill" }] });
    openDialog(() => openRenameFolder("f1"));
    fireEvent.change(screen.getByPlaceholderText("Folder name"), { target: { value: "Calm" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useLibrary.getState().folders).toEqual([{ id: "f1", name: "Calm" }]);
  });
});

describe("delete playlist dialog", () => {
  it("names the playlist, keeps its songs, and deletes on confirm", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(() => openDeletePlaylist("p1"));

    expect(screen.getByText("This can't be undone. The tracks themselves aren't affected.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });
});

describe("playlist export menu", () => {
  const ytTrack: LibraryTrack = {
    id: "dQw4w9WgXcQ",
    title: "Never",
    artist: "Band",
    thumb: null,
    album: null,
    duration: 212,
    explicit: false,
  };
  const exportable: Playlist = { ...roadTrip, name: "  Mix <2026>  ", tracks: [ytTrack] };

  function itemNamed(playlist: Playlist, label: string) {
    const found = playlistHeaderItems(playlist).find((item) => item.label === label);
    if (!found) throw new Error(`no menu item named ${label}`);
    return found;
  }

  beforeEach(() => {
    vi.mocked(downloadText).mockClear();
    useUI.setState({ toasts: [] });
  });

  it("offers both export formats and the song list copy between Rename and Delete playlist", () => {
    const labels = playlistHeaderItems(exportable)
      .filter((item) => !item.subject)
      .map((item) => item.label);
    expect(labels).toEqual([
      "Rename",
      "Export as M3U8",
      "Export as JSON",
      "Copy song list",
      "Sort by",
      "Remove duplicates",
      "Delete playlist",
    ]);
  });

  it("copies the playlist as Artist - Title lines under its name and toasts", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    itemNamed(exportable, "Copy song list").onSelect?.();

    expect(writeText).toHaveBeenCalledWith("# Mix <2026>\nBand - Never\n");
    await vi.waitFor(() => expect(useUI.getState().toasts.at(-1)?.message).toBe("Song list copied"));
  });

  it("saves an M3U8 file named after the playlist with invalid characters replaced", () => {
    itemNamed(exportable, "Export as M3U8").onSelect?.();

    expect(downloadText).toHaveBeenCalledWith("Mix _2026_.m3u8", expect.stringContaining("#EXTM3U"), "audio/x-mpegurl");
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Playlist exported");
  });

  it("saves a JSON file with the playlist's YouTube tracks", () => {
    itemNamed(exportable, "Export as JSON").onSelect?.();

    const [name, text, type] = vi.mocked(downloadText).mock.calls[0];
    expect(name).toBe("Mix _2026_.json");
    expect(type).toBe("application/json");
    expect(JSON.parse(text).tracks).toEqual([{ id: "dQw4w9WgXcQ", title: "Never", artist: "Band", duration: 212 }]);
  });

  it("downloads nothing and says so when no track can be exported", () => {
    const local: Playlist = { ...exportable, tracks: [{ ...ytTrack, id: "local:3f9" }] };

    itemNamed(local, "Export as JSON").onSelect?.();

    expect(downloadText).not.toHaveBeenCalled();
    expect(useUI.getState().toasts.at(-1)?.message).toBe("Nothing to export in this playlist");
  });
});

describe("playlist sort, duplicates and queue", () => {
  const song = (id: string, title: string, artist: string, album: string | null, duration: number): LibraryTrack => ({
    id,
    title,
    artist,
    thumb: null,
    album,
    duration,
    explicit: false,
  });
  const tracks = [
    song("b", "banana", "Zed", null, 200),
    song("a", "Apple", "amy", "Zebra LP", 0),
    song("c", "apple", "Bob", "Alpha", 150),
    song("d", "Cherry", "amy", "alpha", 300),
  ];
  const idsIn = (playlistId = "p1") =>
    useLibrary
      .getState()
      .playlists.find((item) => item.id === playlistId)
      ?.tracks.map((item) => item.id);
  const lastToast = () => useUI.getState().toasts.at(-1);

  it("sorts by title ignoring case and keeps ties in their order", () => {
    expect(sortTracks(tracks, "title").map((item) => item.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("sorts by artist, then by the original order for equal artists", () => {
    expect(sortTracks(tracks, "artist").map((item) => item.id)).toEqual(["a", "d", "c", "b"]);
  });

  it("sorts by album and puts songs without an album last", () => {
    expect(sortTracks(tracks, "album").map((item) => item.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts by duration shortest first and puts unknown durations last", () => {
    expect(sortTracks(tracks, "duration").map((item) => item.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("reorders the playlist and an Undo toast restores the old order", () => {
    useLibrary.setState({ playlists: [{ ...roadTrip, tracks }] });
    sortPlaylistBy("p1", "title");
    expect(idsIn()).toEqual(["a", "c", "b", "d"]);
    expect(lastToast()?.message).toBe("Sorted by title");

    lastToast()?.action?.run();
    expect(idsIn()).toEqual(["b", "a", "c", "d"]);
  });

  it("removes repeated songs, keeps the first, and counts them in the toast", () => {
    useLibrary.setState({ playlists: [{ ...roadTrip, tracks: [tracks[0], tracks[1], tracks[0], tracks[2], tracks[1]] }] });
    removePlaylistDuplicates("p1");
    expect(idsIn()).toEqual(["b", "a", "c"]);
    expect(lastToast()?.message).toBe("Removed 2 duplicates");

    lastToast()?.action?.run();
    expect(idsIn()).toEqual(["b", "a", "b", "c", "a"]);
  });

  it("says so and changes nothing when there are no duplicates", () => {
    useLibrary.setState({ playlists: [{ ...roadTrip, tracks }] });
    removePlaylistDuplicates("p1");
    expect(idsIn()).toEqual(["b", "a", "c", "d"]);
    expect(lastToast()?.message).toBe("No duplicates");
  });

  it("saves the queue as a new playlist named by date, in queue order", () => {
    const id = saveQueueAsPlaylist([tracks[0], tracks[1]]);
    const saved = useLibrary.getState().playlists.find((item) => item.id === id);
    expect(saved?.name).toBe(queueName());
    expect(saved?.name.startsWith("Queue ")).toBe(true);
    expect(saved?.tracks.map((item) => item.id)).toEqual(["b", "a"]);
    expect(lastToast()?.message).toBe(`Saved as ${queueName()}`);

    lastToast()?.action?.run();
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: id });
  });

  it("saves nothing for an empty queue", () => {
    expect(saveQueueAsPlaylist([])).toBeNull();
    expect(useLibrary.getState().playlists).toHaveLength(0);
  });
});

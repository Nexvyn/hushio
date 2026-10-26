import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play,
  pause,
  seekTo,
  setVolume,
  setMuted,
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { FolderView } from "./FolderView";
import { deletionKey } from "../lib/deletionSync";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const song = (i: number): LibraryTrack => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist: "Artist",
  thumb: null,
  album: null,
  duration: 300,
  explicit: false,
});

const playlist = (id: string, extra: Partial<Playlist> = {}): Playlist => ({
  id,
  name: `Playlist ${id}`,
  folderId: null,
  pinned: false,
  tracks: [song(1)],
  ...extra,
});

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState({ ...initialNavigation, view: { name: "folder", param: "f1" } }, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [] }, true);
});

afterEach(cleanup);

describe("Folder page for a missing folder", () => {
  it("explains the folder is gone and opens Your Library", () => {
    render(<FolderView />);

    expect(screen.getByRole("heading", { name: "This folder isn't here anymore" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Your Library" }));
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });
});

describe("Folder page when empty", () => {
  it("asks for playlists below when other playlists exist, and adds one to the folder", () => {
    useLibrary.setState({
      folders: [{ id: "f1", name: "Chill" }],
      playlists: [playlist("a")],
    });
    render(<FolderView />);

    expect(screen.getByRole("heading", { name: "Nothing in here yet" })).toBeTruthy();
    expect(screen.getByText("Add your playlists below.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Add to Chill" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add Playlist a to Chill" }));
    expect(useLibrary.getState().playlists[0].folderId).toBe("f1");
    expect(screen.queryByRole("region", { name: "Add to Chill" })).toBeNull();
  });

  it("asks for a playlist first when there is none to add", () => {
    useLibrary.setState({ folders: [{ id: "f1", name: "Chill" }], playlists: [] });
    render(<FolderView />);

    expect(screen.getByText("Make a playlist first.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Add to Chill" })).toBeNull();
  });

  it("disables Play and Shuffle", () => {
    useLibrary.setState({ folders: [{ id: "f1", name: "Chill" }], playlists: [] });
    render(<FolderView />);

    expect((screen.getByRole("button", { name: "Play Chill" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Shuffle" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Folder page with playlists", () => {
  beforeEach(() => {
    useLibrary.setState({
      folders: [
        { id: "f1", name: "Chill" },
        { id: "f2", name: "Other" },
      ],
      playlists: [
        playlist("a", { folderId: "f1" }),
        playlist("b", { folderId: "f2" }),
        playlist("c", { folderId: null, tracks: [] }),
      ],
    });
  });

  it("lists the playlists inside and the ones that can be added", () => {
    render(<FolderView />);

    const inside = screen.getByRole("region", { name: "Playlists in Chill" });
    expect(inside.textContent).toContain("Playlist a");
    expect(screen.getByText("More of yours to keep in this folder.")).toBeTruthy();
    expect(screen.getByText('In "Other"')).toBeTruthy();
    expect(screen.getByText("0 songs")).toBeTruthy();
  });

  it("moves a playlist from another folder when it is added", () => {
    render(<FolderView />);

    fireEvent.click(screen.getByRole("button", { name: "Add Playlist b to Chill" }));
    expect(useLibrary.getState().playlists.find((item) => item.id === "b")?.folderId).toBe("f1");
  });

  it("plays every song in the folder from the folder id", () => {
    render(<FolderView />);

    fireEvent.click(screen.getByRole("button", { name: "Play Chill" }));
    expect(usePlayer.getState().playingFrom).toBe("f1");
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["s1"]);
  });

  it("opens a playlist inside the folder", () => {
    render(<FolderView />);

    fireEvent.click(screen.getByRole("button", { name: "Open Playlist a" }));
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: "a" });
  });

  it("deletes the folder from its menu after confirmation and returns to Your Library", () => {
    render(<FolderView />);

    fireEvent.click(screen.getByRole("button", { name: "Folder options" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete folder" }));
    const request = useUI.getState().dialog;
    expect(request?.danger).toBe(true);

    request?.onConfirm("");
    const state = useLibrary.getState();
    expect(state.folders.map((item) => item.id)).toEqual(["f2"]);
    expect(state.playlists.find((item) => item.id === "a")?.folderId).toBeNull();
    expect(state.deletionSync?.deletes[deletionKey("folders", "f1")]).toBeGreaterThan(0);
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });

  it("opens the rename folder dialog with the folder name", () => {
    render(<FolderView />);

    fireEvent.click(screen.getByRole("button", { name: "Folder options" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename folder" }));

    expect(useUI.getState().dialog?.title).toBe("Rename folder");
    expect(useUI.getState().dialog?.initialValue).toBe("Chill");
  });
});

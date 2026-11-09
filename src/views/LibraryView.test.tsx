import { ContextMenu } from "../components/ContextMenu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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

import { LibraryView } from "./LibraryView";
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
  duration: 200,
  explicit: false,
});

const playlist = (id: string, extra: Partial<Playlist> = {}): Playlist => ({
  id,
  name: `Playlist ${id}`,
  folderId: null,
  pinned: false,
  tracks: [song(1), song(2)],
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
  useNavigation.setState(initialNavigation, true);
  useUI.setState({ ...initialUI, dialog: null }, true);
});

afterEach(cleanup);

describe("Your Library with nothing saved", () => {
  it("shows zero counts and the no playlists empty state", () => {
    render(<><LibraryView /><ContextMenu /></>);

    expect(screen.getByText("0 playlists · 0 folders · 0 liked songs")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "No playlists yet" })).toBeTruthy();
  });

  it("opens the create menu and starts a new playlist dialog", () => {
    render(<><LibraryView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Playlist/ }));

    expect(useUI.getState().dialog?.title).toBe("New playlist");
    expect(useUI.getState().dialog?.initialValue).toBe("My Playlist #1");
  });
});

describe("Your Library collections", () => {
  it("shows the liked count, pinned first, with the Downloads and Local Music stacks", () => {
    useLibrary.setState({ liked: [song(1), song(2)] });
    render(<><LibraryView /><ContextMenu /></>);

    expect(screen.getByText("Pinned · 2 songs")).toBeTruthy();
    expect(screen.getByText("Nothing saved yet")).toBeTruthy();
    expect(screen.getByText("On this device")).toBeTruthy();
  });

  it("unpins Liked Songs from its menu", () => {
    useLibrary.setState({ liked: [song(1), song(2)] });
    render(<><LibraryView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options for Liked Songs" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unpin" }));

    expect(useLibrary.getState().pinnedSingles.liked).toBe(false);
    expect(screen.getByText("2 songs")).toBeTruthy();
  });

  it("plays Liked Songs from its stack", () => {
    useLibrary.setState({ liked: [song(1), song(2)] });
    render(<><LibraryView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "Play Liked Songs" }));
    expect(usePlayer.getState().playingFrom).toBe("__liked__");
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["s1", "s2"]);
  });
});

describe("Your Library playlists and folders", () => {
  it("lists unfiled playlists with pinned ones first", () => {
    useLibrary.setState({
      playlists: [playlist("a"), playlist("b", { pinned: true }), playlist("c", { folderId: "f" })],
      folders: [{ id: "f", name: "Folder" }],
    });
    render(<><LibraryView /><ContextMenu /></>);

    const section = within(screen.getByRole("region", { name: "Playlists" }));
    const names = section.getAllByRole("button", { name: /^Open / }).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Open Playlist b", "Open Playlist a"]);
  });

  it("explains that every playlist is filed when all of them are in folders", () => {
    useLibrary.setState({
      playlists: [playlist("a", { folderId: "f" })],
      folders: [{ id: "f", name: "Folder" }],
    });
    render(<><LibraryView /><ContextMenu /></>);

    expect(screen.getByText("All your playlists are in folders.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "No playlists yet" })).toBeNull();
  });

  it("shows folder stacks with their playlist count and opens one", () => {
    useLibrary.setState({
      playlists: [playlist("a", { folderId: "f" }), playlist("b", { folderId: "f" })],
      folders: [{ id: "f", name: "Chill" }],
    });
    render(<><LibraryView /><ContextMenu /></>);

    expect(screen.getByText("Folder · 2 playlists")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Chill" }));
    expect(useNavigation.getState().view).toEqual({ name: "folder", param: "f" });
  });

  it("opens a playlist and shows its song count", () => {
    useLibrary.setState({ playlists: [playlist("a")] });
    render(<><LibraryView /><ContextMenu /></>);

    expect(screen.getByText("Playlist · 2 songs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Playlist a" }));
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: "a" });
  });
});

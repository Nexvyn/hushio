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

import { PlaylistView } from "./PlaylistView";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useSelection } from "../stores/selection";
import { useUI } from "../stores/ui";

const song = (i: number, addedAt?: number): LibraryTrack => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist: "Artist A",
  thumb: null,
  album: null,
  duration: 200,
  explicit: false,
  ...(addedAt === undefined ? {} : { addedAt }),
});

const playlist = (tracks: LibraryTrack[]): Playlist => ({
  id: "p1",
  name: "Road trip",
  folderId: null,
  pinned: false,
  tracks,
});

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

const rowOf = (title: string) => screen.getByText(title).closest("li") as HTMLElement;
const selectedTitles = () =>
  ["Song 1", "Song 2", "Song 3"].filter((title) => rowOf(title).className.includes("bg-selected"));

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState({ ...initialNavigation, view: { name: "playlist", param: "p1" } }, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [] }, true);
  useSelection.setState({ lists: {} });
  useLibrary.setState({
    playlists: [playlist([song(1, Date.now() - 86_400_000), song(2), song(3)])],
  });
});

afterEach(cleanup);

describe("Playlist multi-select", () => {
  it("selects one row on click, then adds with Ctrl and extends with Shift", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByText("Song 1"));
    expect(selectedTitles()).toEqual(["Song 1"]);

    fireEvent.click(screen.getByText("Song 3"), { ctrlKey: true });
    expect(selectedTitles()).toEqual(["Song 1", "Song 3"]);

    fireEvent.click(screen.getByText("Song 1"), { shiftKey: true });
    expect(selectedTitles()).toEqual(["Song 1", "Song 2", "Song 3"]);
  });

  it("plays on double click and keeps the playlist as the source", () => {
    render(<PlaylistView />);
    fireEvent.doubleClick(screen.getByText("Song 2"));
    expect(usePlayer.getState().playingFrom).toBe("p1");
    expect(usePlayer.getState().index).toBe(1);
  });

  it("selects all with Ctrl+A and clears with Escape", () => {
    render(<PlaylistView />);
    fireEvent.keyDown(rowOf("Song 1"), { key: "a", ctrlKey: true });
    expect(selectedTitles()).toEqual(["Song 1", "Song 2", "Song 3"]);

    fireEvent.keyDown(rowOf("Song 2"), { key: "Escape" });
    expect(selectedTitles()).toEqual([]);
  });

  it("removes every selected song on Delete and restores them with Undo", () => {
    render(<PlaylistView />);
    fireEvent.click(screen.getByText("Song 1"));
    fireEvent.click(screen.getByText("Song 3"), { ctrlKey: true });

    fireEvent.keyDown(rowOf("Song 3"), { key: "Delete" });
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s2"]);
    const toast = useUI.getState().toasts.at(-1);
    expect(toast?.message).toBe("Removed 2 songs from playlist");

    toast?.action?.run();
    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("keeps the date each song was added in the Date added column", () => {
    render(<PlaylistView />);
    expect(screen.getByText("Date added")).toBeTruthy();
    expect(screen.getByText("1 day ago")).toBeTruthy();
  });
});

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

import { PlayerBar } from "./PlayerBar";
import { type Playlist, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const track = { id: "v1", title: "Night Drive", artist: "Band", thumb: null };
const mix: Playlist = { id: "p1", name: "Mix", folderId: null, pinned: false, tracks: [] };

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState({ ...initialLibrary, playlists: [] }, true);
  usePlayer.setState(initialPlayer, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [] }, true);
});

afterEach(cleanup);

describe("Add to playlist button in the player bar", () => {
  it("is disabled when nothing is playing", () => {
    render(<PlayerBar />);

    expect((screen.getByRole("button", { name: "Add to playlist" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds the playing song to the chosen playlist and confirms it", () => {
    useLibrary.setState({ playlists: [mix] });
    usePlayer.setState({ queue: [track], index: 0 });
    render(<PlayerBar />);

    fireEvent.click(screen.getByRole("button", { name: "Add to playlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Mix" }));

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["v1"]);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toEqual(['Added "Night Drive" to "Mix"']);
  });

  it("says so when the song is already in the playlist", () => {
    useLibrary.setState({
      playlists: [{ ...mix, tracks: [{ ...track, album: null, duration: 0, explicit: false }] }],
    });
    usePlayer.setState({ queue: [track], index: 0 });
    render(<PlayerBar />);

    fireEvent.click(screen.getByRole("button", { name: "Add to playlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Mix" }));

    expect(useLibrary.getState().playlists[0].tracks).toHaveLength(1);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toEqual(['"Night Drive" is already in "Mix"']);
  });

  it("offers to create a playlist when there are none", () => {
    usePlayer.setState({ queue: [track], index: 0 });
    render(<PlayerBar />);

    fireEvent.click(screen.getByRole("button", { name: "Add to playlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Create playlist" }));

    expect(useUI.getState().dialog?.title).toBe("New playlist");
  });
});

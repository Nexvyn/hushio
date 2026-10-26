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
import { PlaylistPicker } from "./PlaylistPicker";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const track = { id: "v1", title: "Night Drive", artist: "Band", thumb: null };

const initialPlayer = usePlayer.getState();
const initialUI = useUI.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useUI.setState({ ...initialUI, dialog: null, playlistPicker: null, toasts: [] }, true);
});

afterEach(cleanup);

describe("Add to playlist button in the player bar", () => {
  it("is disabled when nothing is playing", () => {
    render(<PlayerBar />);

    expect((screen.getByRole("button", { name: "Add to playlist" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the playlist picker with the playing song", () => {
    usePlayer.setState({ queue: [track], index: 0 });
    render(
      <>
        <PlayerBar />
        <PlaylistPicker />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to playlist" }));

    expect(useUI.getState().playlistPicker).toEqual([track]);
    expect(screen.getByRole("dialog", { name: "Add to playlists" })).toBeTruthy();
  });
});

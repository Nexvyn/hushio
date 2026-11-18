import { ContextMenu } from "./ContextMenu";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

vi.mock("../lib/artistCard", () => ({
  resolveArtistRef: vi.fn(async () => null),
  loadArtistCard: vi.fn(),
}));

import { RightRail } from "./RightRail";
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

describe("Track options button in the Now Playing rail", () => {
  it("is disabled when nothing is playing", () => {
    render(<><RightRail /><ContextMenu /></>);

    expect((screen.getByRole("button", { name: "Track options" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the track menu with the add actions for the playing song", () => {
    usePlayer.setState({ queue: [track], index: 0 });
    render(<><RightRail /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "Track options" }));

    expect(screen.getByRole("menu", { name: "Night Drive" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add to Liked Songs" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Add to queue" })).toBeTruthy();
  });

  it("closes its menu on a second press", async () => {
    usePlayer.setState({ queue: [track], index: 0 });
    render(<><RightRail /><ContextMenu /></>);

    const button = screen.getByRole("button", { name: "Track options" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});

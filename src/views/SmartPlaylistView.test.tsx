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

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  replayJournal: async () => [],
}));

import { ContextMenu } from "../components/ContextMenu";
import { SmartPlaylistView } from "./SmartPlaylistView";
import { SMART_EMPTY_MESSAGE } from "../lib/smartLists";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialNavigation = useNavigation.getState();

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState({ ...initialNavigation, view: { name: "smart", param: "most-played" } }, true);
});

afterEach(cleanup);

describe("Smart playlist page", () => {
  it("shows the empty message when nothing has been played or saved yet", async () => {
    render(<><SmartPlaylistView /><ContextMenu /></>);

    expect(await screen.findByText(SMART_EMPTY_MESSAGE)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Play Most played" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves the list as a normal playlist and opens it", async () => {
    useLibrary.setState({
      liked: [
        { id: "x", title: "X", artist: "A", thumb: null, album: null, duration: 100, explicit: false },
        { id: "y", title: "Y", artist: "A", thumb: null, album: null, duration: 100, explicit: false },
      ],
    });
    useNavigation.setState({ view: { name: "smart", param: "recently-added" } });
    render(<><SmartPlaylistView /><ContextMenu /></>);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save as playlist" }));

    const saved = useLibrary.getState().playlists.find((playlist) => playlist.name === "Recently added");
    expect(saved?.tracks.map((track) => track.id)).toEqual(["x", "y"]);
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: saved?.id });
  });
});

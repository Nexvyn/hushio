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

import { PlaylistView } from "./PlaylistView";
import { deletionKey } from "../lib/deletionSync";
import { fmtTotal } from "../lib/format";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const song = (i: number, duration: number, artist = "Artist A"): LibraryTrack => ({
  id: `s${i}`,
  title: `Song ${i}`,
  artist,
  thumb: null,
  album: null,
  duration,
  explicit: false,
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

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState({ ...initialNavigation, view: { name: "playlist", param: "p1" } }, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [] }, true);
});

afterEach(cleanup);

describe("Playlist page for a missing playlist", () => {
  it("explains that the playlist no longer exists", () => {
    useNavigation.setState({ view: { name: "playlist", param: "gone" } });
    render(<PlaylistView />);

    expect(screen.getByRole("heading", { name: "This playlist no longer exists" })).toBeTruthy();
  });
});

describe("Playlist page when empty", () => {
  beforeEach(() => {
    useLibrary.setState({ playlists: [playlist([])] });
  });

  it("offers search and Explore from the empty state", () => {
    render(<PlaylistView />);

    expect(screen.getByRole("heading", { name: "Let's find something for your playlist" })).toBeTruthy();
    expect(screen.getByText("No songs yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Browse Explore" }));
    expect(useNavigation.getState().view).toEqual({ name: "explore" });
  });

  it("disables Shuffle and does nothing when Play is pressed", () => {
    render(<PlaylistView />);

    expect((screen.getByRole("button", { name: "Shuffle" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Play Road trip" }));
    expect(usePlayer.getState().queue).toEqual([]);
  });
});

describe("Playlist page with songs", () => {
  beforeEach(() => {
    useLibrary.setState({
      playlists: [playlist([song(1, 600, "Artist A"), song(2, 1200, "Artist B"), song(3, 0, "Artist B")])],
    });
  });

  it("shows the count, length and top artist", () => {
    render(<PlaylistView />);

    expect(screen.getByRole("heading", { name: "Road trip" })).toBeTruthy();
    expect(screen.getByText(`3 songs · ${fmtTotal(1800)} · Top artist:`, { exact: false })).toBeTruthy();
    expect(screen.getByText("Artist B", { selector: "span.font-semibold" })).toBeTruthy();
  });

  it("starts playback from a clicked row and keeps the playlist as the source", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByText("Song 2"));
    expect(usePlayer.getState().playingFrom).toBe("p1");
    expect(usePlayer.getState().index).toBe(1);
  });

  it("plays the whole playlist from the play button", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "Play Road trip" }));
    expect(usePlayer.getState().queue.map((item) => item.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("moves a song down with the row menu and saves the new order", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s2", "s1", "s3"]);
  });

  it("disables Move up on the first song", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 1" }));
    expect((screen.getByRole("button", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("removes a song from the playlist and records a tombstone", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "More options for Song 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from playlist" }));

    expect(useLibrary.getState().playlists[0].tracks.map((item) => item.id)).toEqual(["s1", "s3"]);
    expect(useLibrary.getState().deletionSync?.deletes[deletionKey("tracks", "p1:s2")]).toBeGreaterThan(0);
  });

  it("adds every song to the queue from the header menu", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Add all to queue" }));

    expect(usePlayer.getState().queue).toHaveLength(3);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain("Playlist added to queue");
  });

  it("opens the rename dialog with the current name", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    expect(useUI.getState().dialog?.title).toBe("Rename playlist");
    expect(useUI.getState().dialog?.initialValue).toBe("Road trip");
  });

  it("asks before deleting and then returns to Your Library", () => {
    render(<PlaylistView />);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const request = useUI.getState().dialog;
    expect(request?.title).toBe("Delete playlist?");
    expect(request?.danger).toBe(true);

    request?.onConfirm("");
    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });

  it("lists the songs in order", () => {
    render(<PlaylistView />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Song 1")).toBeTruthy();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getPlaylistPage } = vi.hoisted(() => ({ getPlaylistPage: vi.fn() }));

vi.mock("../lib/browse", () => ({ getPlaylistPage }));
vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
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

import { RemotePlaylistView } from "./RemotePlaylistView";
import type { SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();
const playQueue = vi.fn();
const addToQueue = vi.fn(() => 1);

type Page = Awaited<ReturnType<typeof getPlaylistPage>>;

function songs(count: number): SearchSong[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    title: `Mix ${index}`,
    artist: "Nova",
    thumb: null,
    artistId: null,
    albumId: null,
    album: "Night Drive",
    duration: 0,
    explicit: false,
    isVideo: false,
  }));
}

function playlistPage(tracks: SearchSong[]): Page {
  return {
    title: "Late Night Mix",
    credit: "Mira • Ana",
    year: "2022",
    thumb: null,
    tracks,
    continuation: null,
    meta: `PLAYLIST • 2022 • ${tracks.length} TRACKS`,
  };
}

beforeEach(() => {
  usePlayer.setState({ playQueue, addToQueue });
  useNavigation.setState({ view: { name: "ytplaylist", param: "PLx" } });
  useUI.setState({ toasts: [] });
});

afterEach(() => {
  cleanup();
  usePlayer.setState(initialPlayer);
  playQueue.mockReset();
  addToQueue.mockClear();
  getPlaylistPage.mockReset();
});

describe("RemotePlaylistView", () => {
  it("shows the title, credit and meta", async () => {
    getPlaylistPage.mockResolvedValue(playlistPage(songs(2)));
    render(<RemotePlaylistView />);

    expect(await screen.findByRole("heading", { level: 1, name: "Late Night Mix" })).toBeTruthy();
    expect(screen.getByText("Mira • Ana")).toBeTruthy();
    expect(screen.getByText("PLAYLIST • 2022 • 2 TRACKS")).toBeTruthy();
    expect(screen.getByText("Mix 0")).toBeTruthy();
    expect(screen.getByText("Mix 1")).toBeTruthy();
  });

  it("says when the playlist has no tracks", async () => {
    getPlaylistPage.mockResolvedValue(playlistPage([]));
    render(<RemotePlaylistView />);

    expect(await screen.findByText("This playlist is empty.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("plays from the first track and from a clicked row", async () => {
    const user = userEvent.setup();
    const tracks = songs(3);
    getPlaylistPage.mockResolvedValue(playlistPage(tracks));
    render(<RemotePlaylistView />);

    await user.click(await screen.findByRole("button", { name: "Play" }));
    expect(playQueue).toHaveBeenLastCalledWith(tracks, 0, undefined);

    await user.click(screen.getByText("Mix 2"));
    expect(playQueue).toHaveBeenLastCalledWith(tracks, 2, undefined);
  });

  it("shuffles from a random index", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const tracks = songs(3);
    getPlaylistPage.mockResolvedValue(playlistPage(tracks));
    render(<RemotePlaylistView />);

    await user.click(await screen.findByRole("button", { name: "Shuffle" }));

    expect(usePlayer.getState().shuffle).toBe(true);
    expect(playQueue).toHaveBeenCalledWith(tracks, 0, undefined);
    vi.restoreAllMocks();
  });

  it("adds all tracks to the queue with the playlist message", async () => {
    const user = userEvent.setup();
    const tracks = songs(2);
    getPlaylistPage.mockResolvedValue(playlistPage(tracks));
    render(<RemotePlaylistView />);

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Add all to queue" }));

    expect(addToQueue).toHaveBeenCalledWith(tracks);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain("Playlist added to queue");
  });

  it("copies the playlist link", async () => {
    const user = userEvent.setup();
    getPlaylistPage.mockResolvedValue(playlistPage(songs(1)));
    render(<RemotePlaylistView />);

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await navigator.clipboard.readText()).toBe("https://music.youtube.com/playlist?list=PLx");
  });

  it("shows the error state and retries", async () => {
    const user = userEvent.setup();
    getPlaylistPage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(playlistPage(songs(1)));
    render(<RemotePlaylistView />);

    expect(await screen.findByText("Couldn't load this playlist")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Late Night Mix" })).toBeTruthy();
  });
});

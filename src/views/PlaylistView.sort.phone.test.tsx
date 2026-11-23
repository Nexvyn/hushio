import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

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

import { ContextMenu } from "../components/ContextMenu";
import { PlaylistView } from "./PlaylistView";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useTrackSort } from "../stores/trackSort";
import { useUI } from "../stores/ui";

const songs: LibraryTrack[] = [
  { id: "s1", title: "Song 1", artist: "Artist B", thumb: null, album: "Beta", duration: 200, explicit: false, addedAt: 1 },
  { id: "s2", title: "Song 2", artist: "Artist A", thumb: null, album: "Gamma", duration: 210, explicit: false, addedAt: 2 },
  { id: "s3", title: "Song 3", artist: "Artist A", thumb: null, album: "Alpha", duration: 220, explicit: false, addedAt: 3 },
  { id: "s4", title: "Song 4", artist: "Artist C", thumb: null, album: "Delta", duration: 230, explicit: false, addedAt: 4 },
];

const playlist: Playlist = { id: "p1", name: "Road trip", folderId: null, pinned: false, tracks: songs };

const initialLibrary = useLibrary.getState();
const initialPlayer = usePlayer.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

const TITLES = songs.map((song) => song.title);
const displayedTitles = () =>
  Array.from(document.querySelectorAll("ol > li"))
    .map((item) => TITLES.find((title) => item.textContent?.includes(title)))
    .filter((title): title is string => title !== undefined);
const dragRows = () => document.querySelectorAll("[data-row-key]").length;

async function chooseSort(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: "Sort songs" }));
  const options = await screen.findAllByRole("menuitemradio", { name });
  await user.click(options[options.length - 1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  playStream.mockResolvedValue(undefined);
  useLibrary.setState(initialLibrary, true);
  usePlayer.setState(initialPlayer, true);
  useNavigation.setState({ ...initialNavigation, view: { name: "playlist", param: "p1" } }, true);
  useUI.setState({ ...initialUI, dialog: null, toasts: [], contextMenu: null }, true);
  useTrackSort.setState({ sorts: {} });
  useLibrary.setState({ playlists: [playlist] });
});

afterEach(cleanup);

describe("Playlist sort menu on phone", () => {
  it("sorts by artist then album, turns drag off, and restores custom order", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PlaylistView />
        <ContextMenu />
      </>,
    );
    expect(displayedTitles()).toEqual(["Song 1", "Song 2", "Song 3", "Song 4"]);
    expect(dragRows()).toBe(4);

    await chooseSort(user, "Artist");
    await chooseSort(user, "Album");

    expect(displayedTitles()).toEqual(["Song 3", "Song 2", "Song 1", "Song 4"]);
    expect(screen.getByRole("button", { name: "Sort songs" }).textContent).toContain("Artist, then Album");
    expect(dragRows()).toBe(0);

    await chooseSort(user, "Custom order");

    expect(displayedTitles()).toEqual(["Song 1", "Song 2", "Song 3", "Song 4"]);
    expect(dragRows()).toBe(4);
  });

  it("plays the first row in the displayed order", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PlaylistView />
        <ContextMenu />
      </>,
    );
    await chooseSort(user, "Artist");
    await chooseSort(user, "Album");

    await user.click(screen.getByText("Song 3"));

    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["s3", "s2", "s1", "s4"]);
    expect(usePlayer.getState().index).toBe(0);
  });
});

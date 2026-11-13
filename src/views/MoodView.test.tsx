import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo, loadMoods, freshMoods, getMoodCovers, loadMoodPage, peekMoodPage, loadMix } =
  vi.hoisted(() => ({
    audio: new Audio(),
    playStream: vi.fn(),
    seekTo: vi.fn(),
    loadMoods: vi.fn(),
    freshMoods: vi.fn(),
    getMoodCovers: vi.fn(),
    loadMoodPage: vi.fn(),
    peekMoodPage: vi.fn(),
    loadMix: vi.fn(),
  }));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo,
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

vi.mock("../lib/explore", () => ({ loadMoods, freshMoods, getMoodCovers }));
vi.mock("../lib/moodPage", () => ({ loadMoodPage, peekMoodPage, loadMix }));

import { MoodView } from "./MoodView";
import type { MoodEntry } from "../lib/moods";
import type { MoodPage } from "../lib/moodPage";
import type { SearchSong } from "../lib/searchParse";
import { useExploreCovers } from "../lib/exploreCovers";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const initialPlayer = usePlayer.getState();
const CATEGORY = "FEmusic_moods_and_genres_category";
const LOAD_FAILED = "This page couldn't be loaded right now. Try again in a moment.";

const focus: MoodEntry = {
  title: "Focus",
  browseId: CATEGORY,
  params: "p1",
  color: "#123456",
  section: "Moods",
};

function song(id: string, title: string): SearchSong {
  return {
    id,
    title,
    artist: "Dua Lipa",
    thumb: null,
    artistId: null,
    albumId: null,
    album: null,
    duration: 200,
    explicit: false,
    isVideo: false,
  };
}

const alpha = song("s1", "Alpha");
const beta = song("s2", "Beta");
const gamma = song("s3", "Gamma");

const albums = Array.from({ length: 16 }, (_, index) => ({
  id: `MPREb_${index + 1}`,
  title: `Album ${index + 1}`,
  subtitle: "Dua Lipa",
  thumb: null,
}));

const page: MoodPage = {
  title: "Focus page",
  shelves: [
    {
      title: "Playlists",
      items: [{ playlist: { id: "VLpl1", title: "Chill Hits", subtitle: "Playlist", thumb: null } }],
    },
    { title: "Albums", items: albums.map((album) => ({ album })) },
    {
      title: "Artists",
      items: [{ artist: { id: "UCa", title: "Dua Lipa", subtitle: "", thumb: null } }],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  playStream.mockResolvedValue(undefined);
  usePlayer.setState(initialPlayer, true);
  useExploreCovers.setState({ byKey: {} });
  useNavigation.setState({ view: { name: "mood", param: "p1" }, navPast: [], navFuture: [] });
  freshMoods.mockReturnValue(null);
  loadMoods.mockResolvedValue([focus]);
  getMoodCovers.mockResolvedValue([]);
  peekMoodPage.mockReturnValue(undefined);
  loadMoodPage.mockResolvedValue(page);
  loadMix.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MoodView", () => {
  it("shows the mood title while the page loads, without the failure message", async () => {
    loadMoodPage.mockReturnValue(new Promise(() => {}));
    render(<MoodView />);
    expect(await screen.findByRole("heading", { level: 1, name: "Focus" })).toBeTruthy();
    expect(screen.queryByText(LOAD_FAILED)).toBeNull();
  });

  it("shows the failure message when the page cannot load", async () => {
    loadMoodPage.mockResolvedValue(null);
    render(<MoodView />);
    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
  });

  it("shows the mix size and plays the mix from the row that was clicked", async () => {
    loadMix.mockResolvedValue([alpha, beta, gamma]);
    render(<MoodView />);
    expect(await screen.findByText("3 songs")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Beta/ }));

    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["s1", "s2", "s3"]);
    expect(usePlayer.getState().index).toBe(1);
    expect(playStream).toHaveBeenCalledWith("s2", "Beta");
  });

  it("says it is mixing while the mix is built", async () => {
    loadMix.mockReturnValue(new Promise(() => {}));
    render(<MoodView />);
    expect(await screen.findByText("Mixing its top playlists…")).toBeTruthy();
  });

  it("starts the mix shuffled when Shuffle is pressed", async () => {
    loadMix.mockResolvedValue([alpha, beta, gamma]);
    render(<MoodView />);
    await userEvent.click(await screen.findByRole("button", { name: "Shuffle" }));
    expect(usePlayer.getState().shuffle).toBe(true);
    expect(usePlayer.getState().queue).toHaveLength(3);
  });

  it("shows fifteen albums and expands the wall on request", async () => {
    render(<MoodView />);
    expect(await screen.findByRole("button", { name: "Show all 16" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Album 16/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Show all 16" }));

    expect(await screen.findByRole("button", { name: /^Album 16\b/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });

  it("opens a playlist from the crate", async () => {
    render(<MoodView />);
    await userEvent.click(await screen.findByRole("button", { name: /Chill Hits/ }));
    expect(useNavigation.getState().view).toEqual({ name: "ytplaylist", param: "VLpl1" });
  });

  it("does not start a mix before the page has loaded", async () => {
    loadMoodPage.mockReturnValue(new Promise(() => {}));
    render(<MoodView />);
    await act(async () => {});
    await waitFor(() => expect(loadMix).not.toHaveBeenCalled());
  });
});

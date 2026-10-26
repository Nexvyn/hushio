import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getArtistPage } = vi.hoisted(() => ({ getArtistPage: vi.fn() }));

vi.mock("../lib/browse", () => ({ getArtistPage }));
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

import { ArtistView } from "./ArtistView";
import type { ArtistPage } from "../lib/browseParse";
import type { SearchSong } from "../lib/searchParse";
import { useArtistMeta } from "../stores/artistMeta";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();
const playQueue = vi.fn();
const addToQueue = vi.fn(() => 1);

function songs(count: number): SearchSong[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    title: `Song ${index}`,
    artist: "Nova",
    thumb: null,
    artistId: "UCnova",
    albumId: null,
    album: null,
    duration: 120,
    explicit: false,
    isVideo: false,
  }));
}

function artistPage(overrides: Partial<ArtistPage> = {}): ArtistPage {
  return {
    artist: { id: "UCnova", name: "Nova", thumb: null },
    description: "Dream pop from Lisbon.",
    subscriberCount: "1.2M subscribers",
    monthlyListeners: "332M monthly listeners",
    songs: songs(3),
    shelves: [],
    ...overrides,
  };
}

function renderArtist(page: ArtistPage) {
  getArtistPage.mockResolvedValue(page);
  render(<ArtistView />);
}

beforeEach(() => {
  usePlayer.setState({ playQueue, addToQueue });
  useNavigation.setState({ view: { name: "artist", param: "UCnova" } });
  useArtistMeta.setState({ byName: {} });
  useUI.setState({ toasts: [] });
});

afterEach(() => {
  cleanup();
  usePlayer.setState(initialPlayer);
  playQueue.mockReset();
  addToQueue.mockClear();
  getArtistPage.mockReset();
  vi.restoreAllMocks();
});

describe("ArtistView", () => {
  it("shows a loading state until the page arrives", () => {
    getArtistPage.mockReturnValue(new Promise(() => {}));
    render(<ArtistView />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("shows the name, the chips and the about text", async () => {
    renderArtist(artistPage());

    expect(await screen.findByRole("heading", { level: 1, name: "Nova" })).toBeTruthy();
    expect(screen.getByText("1.2M subscribers")).toBeTruthy();
    expect(screen.getByText("332M monthly listeners")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "About the artist" })).toBeTruthy();
    expect(screen.getByText("Dream pop from Lisbon.")).toBeTruthy();
  });

  it("omits the about section and the chips when the provider has none", async () => {
    renderArtist(artistPage({ description: null, subscriberCount: null, monthlyListeners: null }));

    await screen.findByRole("heading", { level: 1, name: "Nova" });
    expect(screen.queryByRole("heading", { name: "About the artist" })).not.toBeTruthy();
    expect(screen.queryByText(/subscribers|monthly listeners/)).not.toBeTruthy();
  });

  it("lists at most 20 top songs", async () => {
    renderArtist(artistPage({ songs: songs(25) }));

    await screen.findByRole("heading", { name: "Top songs" });
    expect(screen.getAllByRole("button", { name: /^More options for Song / })).toHaveLength(20);
  });

  it("plays the top songs from the first one with the artist as the source", async () => {
    const user = userEvent.setup();
    const page = artistPage();
    renderArtist(page);

    await user.click(await screen.findByRole("button", { name: "Play" }));

    expect(playQueue).toHaveBeenCalledWith(page.songs, 0, "UCnova");
  });

  it("plays from a clicked row", async () => {
    const user = userEvent.setup();
    const page = artistPage();
    renderArtist(page);

    await user.click(await screen.findByText("Song 1"));

    expect(playQueue).toHaveBeenCalledWith(page.songs, 1, "UCnova");
  });

  it("shuffles the top songs and turns shuffle on", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const page = artistPage();
    renderArtist(page);

    await user.click(await screen.findByRole("button", { name: "Shuffle" }));

    expect(usePlayer.getState().shuffle).toBe(true);
    expect(playQueue).toHaveBeenCalledWith(page.songs, 1, "UCnova");
  });

  it("adds every top song to the queue from the More menu and says how many", async () => {
    const user = userEvent.setup();
    renderArtist(artistPage());

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Add all to queue" }));

    expect(addToQueue).toHaveBeenCalledWith(songs(3));
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain("Added 3 songs to queue");
  });

  it("keeps Follow artist disabled until the library exists", async () => {
    const user = userEvent.setup();
    renderArtist(artistPage());

    await user.click(await screen.findByRole("button", { name: "More options" }));

    expect((screen.getByRole("button", { name: "Follow artist" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("remembers the artist name and id", async () => {
    renderArtist(artistPage());

    await screen.findByRole("heading", { level: 1, name: "Nova" });
    await waitFor(() => expect(useArtistMeta.getState().byName.nova?.id).toBe("UCnova"));
  });

  it("opens an album shelf card", async () => {
    const user = userEvent.setup();
    renderArtist(
      artistPage({
        shelves: [
          {
            title: "Albums",
            items: [{ kind: "album", id: "MPREalb", title: "Night Drive", artist: "Nova", thumb: null }],
          },
        ],
      }),
    );

    await user.click(await screen.findByRole("button", { name: /Night Drive/ }));

    expect(useNavigation.getState().view).toEqual({ name: "album", param: "MPREalb" });
  });

  it("shows the error state and retries the load", async () => {
    const user = userEvent.setup();
    getArtistPage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(artistPage());
    render(<ArtistView />);

    expect(await screen.findByText("Couldn't load this artist")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Nova" })).toBeTruthy();
    expect(getArtistPage).toHaveBeenCalledTimes(2);
  });
});

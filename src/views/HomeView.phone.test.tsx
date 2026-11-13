import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo, refreshHome } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
  refreshHome: vi.fn(),
}));

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

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

vi.mock("../lib/market", () => ({
  marketValue: () => ({ location: "US", lang: "en" }),
}));

vi.mock("../lib/home", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/home")>()),
  refreshHome,
}));

import { HomeView } from "./HomeView";
import type { HomeShelf } from "../lib/home";
import { useHomeCache } from "../stores/homeCache";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecentItems } from "../stores/recents";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();

const quickPicks: HomeShelf = {
  title: "Quick picks",
  items: [
    { kind: "track", track: { id: "shelf-1", title: "Shelf song", artist: "Shelf artist", thumb: null } },
    { kind: "album", id: "MPREalbum", title: "Shelf album", artist: "Album artist", thumb: null },
  ],
};

describe("HomeView on the phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshHome.mockResolvedValue([]);
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "" });
    useHomeCache.setState({ market: null, shelves: [], fetchedAt: null });
    useRecentItems.setState({ items: [] });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  });

  afterEach(cleanup);

  it("renders shelf cards with the 148px phone card", () => {
    useHomeCache.setState({ market: "US", shelves: [quickPicks], fetchedAt: Date.now() });
    render(<HomeView />);

    expect(screen.getByRole("button", { name: /Shelf song/ }).className).toContain("w-[148px]");
    expect(screen.getByRole("button", { name: /Shelf album/ }).className).toContain("w-[148px]");
  });

  it("opens settings from the profile button in the phone header", async () => {
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: "Profile and settings" }));

    expect(useNavigation.getState().view.name).toBe("settings");
  });

  it("plays a shelf track from the phone card", async () => {
    useHomeCache.setState({ market: "US", shelves: [quickPicks], fetchedAt: Date.now() });
    playStream.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: /Shelf song/ }));

    expect(playStream).toHaveBeenCalledWith("shelf-1", "Shelf song");
  });

  it("shows recent songs as two-column quick tiles of 56px", () => {
    useRecentItems.setState({
      items: [
        { kind: "song", id: "a", title: "First", subtitle: "Artist", thumb: null },
        { kind: "song", id: "b", title: "Second", subtitle: "Artist", thumb: null },
      ],
    });
    render(<HomeView />);

    const tile = screen.getByRole("button", { name: /First/ });
    expect(tile.className).toContain("h-14");
    expect(tile.parentElement?.className).toContain("grid-cols-2");
  });

  it("uses 164px squares and a 132px block for the loading skeleton", () => {
    refreshHome.mockReturnValue(new Promise(() => {}));
    render(<HomeView />);

    const loading = screen.getByRole("status", { name: "Loading Home" });
    expect(loading.querySelector(".w-\\[164px\\]")).not.toBeNull();
    expect(loading.querySelector(".h-\\[132px\\]")).not.toBeNull();
    expect(loading.querySelector(".h-\\[220px\\]")).toBeNull();
  });

  it("titles the page with the greeting for the time of day", () => {
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(14);
    render(<HomeView />);

    expect(screen.getByRole("heading", { name: "Good afternoon" })).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("shows recent albums and playlists in the phone quick grid", () => {
    useRecentItems.setState({
      items: [
        { kind: "album", id: "MPREalbum", title: "Recent album", subtitle: "Artist", thumb: null },
        { kind: "playlist", id: "PLrecent", title: "Recent playlist", subtitle: "Owner", thumb: null },
      ],
    });
    render(<HomeView />);

    expect(screen.getByRole("button", { name: /Recent album/ }).className).toContain("h-14");
    expect(screen.getByRole("button", { name: /Recent playlist/ }).className).toContain("h-14");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo, refreshHome, feed } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
  refreshHome: vi.fn(),
  feed: { sections: [] as unknown[] },
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

vi.mock("../lib/useHomeFeed", () => ({ useHomeFeed: () => feed.sections }));

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
    { kind: "artist", id: "UCartist", name: "Shelf artist page", thumb: null },
  ],
};

function feedSection(name: string) {
  return {
    id: name,
    kind: name,
    title: name,
    layout: "yt-shelf",
    priority: 0,
    items: [],
    shelf: { id: name, title: name, items: [{ kind: "album", id: `${name}-album`, title: `${name} album`, artist: "Artist", thumb: null }] },
  };
}

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feed.sections = [];
    refreshHome.mockResolvedValue([]);
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "" });
    useHomeCache.setState({ market: null, language: "en", shelves: [], fetchedAt: null, continuation: null });
    useRecentItems.setState({ items: [] });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  });

  afterEach(cleanup);

  it("starts with the filter chips, with no Home title or refresh button", () => {
    render(<HomeView />);

    expect(screen.queryByRole("heading", { level: 1, name: "Home" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh Home" })).toBeNull();
    expect(screen.getByRole("group", { name: "Filter Home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play test song" })).toBeNull();
  });

  it("shows cached shelves while the refresh is still running", () => {
    useHomeCache.setState({ market: "US", shelves: [quickPicks], fetchedAt: Date.now() });
    refreshHome.mockReturnValue(new Promise(() => {}));

    render(<HomeView />);

    expect(screen.getByRole("heading", { name: "Quick picks" })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading Home" })).toBeNull();
  });

  it("shows every feed section, not only the first three", () => {
    feed.sections = ["Heavy rotation", "Stations", "Dust these off", "Quick mixes"].map(feedSection);

    render(<HomeView />);

    expect(screen.getByText("Quick mixes")).toBeTruthy();
  });

  it("shows loading placeholders until the first refresh settles", () => {
    refreshHome.mockReturnValue(new Promise(() => {}));

    render(<HomeView />);

    expect(screen.getByRole("status", { name: "Loading Home" })).toBeTruthy();
  });

  it("plays a track from a shelf when its card is pressed", async () => {
    useHomeCache.setState({ market: "US", shelves: [quickPicks], fetchedAt: Date.now() });
    playStream.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: /Shelf song/ }));

    expect(playStream).toHaveBeenCalledWith("shelf-1", "Shelf song", 0, expect.any(Object));
  });

  it("opens an album or artist card on its page", async () => {
    useHomeCache.setState({ market: "US", shelves: [quickPicks], fetchedAt: Date.now() });
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(screen.getByRole("button", { name: /Shelf album/ }));
    expect(useNavigation.getState().view).toEqual({ name: "album", param: "MPREalbum" });

    useNavigation.setState({ view: { name: "home" } });
    await user.click(screen.getByRole("button", { name: /Shelf artist page/ }));
    expect(useNavigation.getState().view).toEqual({ name: "artist", param: "UCartist" });
  });

  it("shows recent songs as quick tiles that play on press", async () => {
    useRecentItems.setState({
      items: [
        { kind: "song", id: "recent-1", title: "Recent song", subtitle: "Recent artist", thumb: null },
        { kind: "album", id: "MPREold", title: "Old album", subtitle: "Old artist", thumb: null },
      ],
    });
    playStream.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<HomeView />);

    expect(screen.getByRole("button", { name: /Old album/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Recent song/ }));

    expect(playStream).toHaveBeenCalledWith("recent-1", "Recent song", 0, expect.any(Object));
  });

  it("shows no mood chips under the Home title", () => {
    render(<HomeView />);

    expect(screen.queryByRole("button", { name: "Lo-fi beats" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Today's hits" })).toBeNull();
  });

  it("offers a retry when Home fails to load and nothing is cached", async () => {
    refreshHome.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<HomeView />);

    expect(await screen.findByText("Couldn't load Home")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
    expect(refreshHome).toHaveBeenCalledTimes(2);
  });

  it("sends an empty Home to Search", async () => {
    const user = userEvent.setup();
    render(<HomeView />);

    await user.click(await screen.findByRole("button", { name: "Search for songs" }));

    expect(useNavigation.getState().view).toEqual({ name: "search" });
  });
});

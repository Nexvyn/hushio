import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo, cachedSearchPage, peekSearchPage, searchMore, chrome } = vi.hoisted(() => ({
  audio: new Audio(),
  chrome: { platform: "windows" as "windows" | "macos" | "android" },
  playStream: vi.fn(),
  seekTo: vi.fn(),
  cachedSearchPage: vi.fn(),
  peekSearchPage: vi.fn(),
  searchMore: vi.fn(),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  get platform() {
    return chrome.platform;
  },
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

vi.mock("../lib/search", () => ({ cachedSearchPage, peekSearchPage, searchMore }));

import { SearchView } from "./SearchView";
import type { SearchRow, SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { useLocalLibrary } from "../stores/localLibrary";
import { useSettings } from "../stores/settings";
import { usePlayer } from "../stores/player";
import { useRecentItems, useRecents } from "../stores/recents";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();

function song(id: string, title: string, artist = "Dua Lipa"): SearchSong {
  return {
    id,
    title,
    artist,
    thumb: null,
    artistId: null,
    albumId: null,
    album: null,
    duration: 203,
    explicit: false,
    isVideo: false,
  };
}

function songRow(id: string, title: string): SearchRow {
  return { kind: "track", track: song(id, title) };
}

const artistRow: SearchRow = {
  kind: "browse",
  item: { type: "artist", browseId: "UC1", title: "Dua Lipa", subtitle: "12M subscribers", thumb: null },
};

describe("SearchView", () => {
  let observers: ((entries: { isIntersecting: boolean }[]) => void)[];

  beforeEach(() => {
    vi.clearAllMocks();
    playStream.mockResolvedValue(undefined);
    observers = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    peekSearchPage.mockReturnValue(undefined);
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all" });
    useRecents.setState({ searches: [] });
    useRecentItems.setState({ items: [] });
    useNavigation.setState({ view: { name: "search" } });
  });

  afterEach(() => {
    chrome.platform = "windows";
    window.innerWidth = 1024;
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the empty hero when nothing was searched or opened", () => {
    render(<SearchView />);

    expect(screen.getByText("Search Hushio")).toBeTruthy();
    expect(
      screen.getByText(
        "Find songs, albums, artists and playlists. Press Ctrl+F anywhere to jump into search.",
      ),
    ).toBeTruthy();
    expect(cachedSearchPage).not.toHaveBeenCalled();
  });

  it("shows no podcast filter while podcasts are disabled", () => {
    render(<SearchView />);
    expect(screen.queryByRole("button", { name: /podcast/i })).toBeNull();
  });

  it("names the Cmd+F shortcut on macOS", () => {
    chrome.platform = "macos";
    render(<SearchView />);

    expect(
      screen.getByText(
        "Find songs, albums, artists and playlists. Press ⌘F anywhere to jump into search.",
      ),
    ).toBeTruthy();
  });

  it("lists recent searches and runs the one that is clicked", async () => {
    useRecents.setState({ searches: ["daft punk"] });
    cachedSearchPage.mockResolvedValue({ rows: [], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    await user.click(screen.getByRole("button", { name: "daft punk" }));

    await waitFor(() => expect(cachedSearchPage).toHaveBeenCalledWith("daft punk", "all"));
    expect(useUI.getState().searchQuery).toBe("daft punk");
  });

  it("announces the result count through a live region", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical"), artistRow], continuation: null });
    useUI.setState({ searchQuery: "dua" });

    render(<SearchView />);

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("2 results"));
  });

  it("groups the All results under the top result card", async () => {
    cachedSearchPage.mockResolvedValue({
      rows: [{ kind: "top", song: song("top", "Levitating") }, songRow("s1", "Physical"), artistRow],
      continuation: null,
    });
    useUI.setState({ searchQuery: "dua" });

    render(<SearchView />);

    expect(await screen.findByRole("heading", { name: "Songs" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Artists" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Top result" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("runs the chosen filter as its own request", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical")], continuation: null });
    useUI.setState({ searchQuery: "dua" });
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByRole("heading", { name: "Songs" });

    await user.click(screen.getByRole("button", { name: "Albums" }));

    await waitFor(() => expect(cachedSearchPage).toHaveBeenLastCalledWith("dua", "albums"));
    expect(useUI.getState().searchFilter).toBe("albums");
  });

  it("offers a retry after a failed search", async () => {
    cachedSearchPage
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ rows: [songRow("s1", "Physical")], continuation: null });
    useUI.setState({ searchQuery: "dua" });
    const user = userEvent.setup();
    render(<SearchView />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Search didn't go through")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Songs" })).toBeTruthy();
    expect(cachedSearchPage).toHaveBeenCalledTimes(2);
  });

  it("says when nothing matched", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [], continuation: null });
    useUI.setState({ searchQuery: "zzz" });
    render(<SearchView />);

    expect(await screen.findByRole("heading", { name: "No results for “zzz”" })).toBeTruthy();
    expect(screen.getByText("Check the spelling or try another keyword.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("No results for “zzz”");
  });

  it("loads the next page when the sentinel comes into view", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical")], continuation: "TOKEN" });
    searchMore.mockResolvedValue({ rows: [songRow("s2", "Second page song")], continuation: null });
    useUI.setState({ searchQuery: "dua" });
    render(<SearchView />);
    await screen.findByRole("heading", { name: "Songs" });

    await act(async () => {
      observers.at(-1)?.([{ isIntersecting: true }]);
    });

    expect(await screen.findByText("Second page song")).toBeTruthy();
    expect(searchMore).toHaveBeenCalledWith("TOKEN", "all");
  });

  it("keeps results and offers an explicit retry when pagination fails", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical")], continuation: "TOKEN" });
    searchMore.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ rows: [songRow("s2", "Recovered")], continuation: null });
    useUI.setState({ searchQuery: "dua" });
    const user = userEvent.setup();
    render(<SearchView />);
    await screen.findByRole("heading", { name: "Songs" });
    await act(async () => { observers.at(-1)?.([{ isIntersecting: true }]); });
    expect(await screen.findByText("Couldn't load more results")).toBeTruthy();
    expect(screen.getByText("Physical")).toBeTruthy();
    expect(searchMore).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Recovered")).toBeTruthy();
    expect(screen.queryByText("Couldn't load more results")).toBeNull();
  });

  it("opens the playlist picker for the top song", async () => {
    const top = song("top", "Levitating");
    cachedSearchPage.mockResolvedValue({ rows: [{ kind: "top", song: top }], continuation: null });
    useUI.setState({ searchQuery: "dua", playlistPicker: null });
    const user = userEvent.setup();
    render(<SearchView />);
    await user.click(await screen.findByRole("button", { name: "Add to playlist" }));
    expect(useUI.getState().playlistPicker).toEqual([top]);
    useUI.setState({ playlistPicker: null });
  });

  it("plays a song from the results and remembers the search and the song", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical")], continuation: null });
    useUI.setState({ searchQuery: "dua" });
    const user = userEvent.setup();
    render(<SearchView />);

    await user.click(await screen.findByRole("button", { name: /^Physical/ }));

    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["s1"]);
    expect(useRecents.getState().searches).toEqual(["dua"]);
    expect(useRecentItems.getState().items[0]).toMatchObject({ kind: "song", id: "s1", subtitle: "Dua Lipa" });
  });

  it("opens a recently opened artist", async () => {
    useRecentItems.setState({
      items: [{ kind: "artist", id: "UC1", title: "Dua Lipa", subtitle: "12M subscribers", thumb: null }],
    });
    const user = userEvent.setup();
    render(<SearchView />);

    await user.click(screen.getByRole("button", { name: /^Dua Lipa/ }));

    expect(useNavigation.getState().view).toEqual({ name: "artist", param: "UC1" });
  });

  describe("browse entries", () => {
    function usePhone() {
      chrome.platform = "android";
      window.innerWidth = 400;
    }

    it("shows no Browse all section on the phone when the search is empty", () => {
      usePhone();
      render(<SearchView />);

      expect(screen.queryByRole("heading", { name: "Browse all" })).toBeNull();
    });


    it("shows the full browse grid on desktop", () => {
      render(<SearchView />);

      expect(screen.getByRole("heading", { name: "Browse all" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Charts" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Liked Songs" })).toBeTruthy();
    });

    it("hides the browse entries while a query is typed", async () => {
      usePhone();
      cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical")], continuation: null });
      useUI.setState({ searchQuery: "dua" });
      render(<SearchView />);

      await screen.findByRole("button", { name: /^Physical/ });

      expect(screen.queryByRole("heading", { name: "Browse all" })).toBeNull();
    });
  });
});

describe("SearchView search scope", () => {
  const initialLocal = useLocalLibrary.getState();
  const initialSettings = useSettings.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    cachedSearchPage.mockResolvedValue({ rows: [], continuation: null });
    peekSearchPage.mockReturnValue(undefined);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "nova", searchFilter: "all" });
    useLocalLibrary.setState({
      loaded: true,
      library: {
        folders: [],
        scannedAt: 1,
        unplayable: [],
        tracks: [
          { id: "local:1", path: "/music/blue.mp3", title: "Blue Hour", artist: "Nova", album: "Night Air", duration: 200, size: 1, mtime: 1 },
          { id: "local:2", path: "/music/red.mp3", title: "Red Sun", artist: "Ember", album: "Daybreak", duration: 150, size: 1, mtime: 1 },
        ],
      },
    });
    useSettings.setState({ addonSources: [] });
  });

  afterEach(() => {
    useLocalLibrary.setState(initialLocal, true);
    useSettings.setState(initialSettings, true);
    cleanup();
  });

  it("offers Add-ons only while an add-on source is enabled", () => {
    const { unmount } = render(<SearchView />);
    expect(screen.getByRole("button", { name: "On device" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add-ons" })).toBeNull();
    unmount();

    useSettings.setState({
      addonSources: [
        {
          id: "one",
          name: "One",
          baseUrl: "https://one.example",
          manifest: { id: "one", name: "One", version: "1", resources: [], settings: [] },
          enabled: true,
          priority: 0,
          lastHealth: null,
        },
      ],
    });
    render(<SearchView />);
    expect(screen.getByRole("button", { name: "Add-ons" })).toBeTruthy();
  });

  it("searches the local library by title, artist and album without a network search", async () => {
    const user = userEvent.setup();
    render(<SearchView />);

    await user.click(screen.getByRole("button", { name: "On device" }));
    cachedSearchPage.mockClear();

    expect(await screen.findByText("Blue Hour")).toBeTruthy();
    expect(screen.queryByText("Red Sun")).toBeNull();
    expect(cachedSearchPage).not.toHaveBeenCalled();
  });
});

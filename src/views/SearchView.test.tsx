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

vi.mock("../lib/explore", () => ({
  freshMoods: () => null,
  loadMoods: () => new Promise(() => {}),
  getMoodCovers: async () => [],
}));

import { SearchView } from "./SearchView";
import type { SearchRow, SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecentItems, useRecents } from "../stores/recents";
import { useUI } from "../stores/ui";
import { FALLBACK_MOODS } from "../lib/moods";

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

    it("shows Browse all with Charts, New releases and Explore on the phone when the search is empty", () => {
      usePhone();
      render(<SearchView />);

      expect(screen.getByRole("heading", { name: "Browse all" })).toBeTruthy();
      for (const name of ["Charts", "New releases"]) {
        expect(screen.getByRole("button", { name }).className).toContain("h-24");
      }
      expect(screen.getByRole("button", { name: "Explore" }).className).toContain("h-11");
    });

    it("puts Browse all below recent searches", () => {
      usePhone();
      useRecents.setState({ searches: ["daft punk"] });
      render(<SearchView />);

      const browse = screen.getByRole("heading", { name: "Browse all" });
      const recent = screen.getByRole("heading", { name: "Recent searches" });
      expect(recent.compareDocumentPosition(browse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("shows placeholder tiles, not the fallback mood names, while the moods load", () => {
      usePhone();
      const { container } = render(<SearchView />);

      for (const mood of FALLBACK_MOODS) {
        expect(screen.queryByRole("button", { name: mood.title })).toBeNull();
      }
      expect(container.querySelectorAll(".bt-skeleton > div")).toHaveLength(8);
    });

    it.each([
      ["Explore", { name: "explore" }],
      ["Charts", { name: "charts" }],
      ["New releases", { name: "newreleases" }],
    ])("opens %s from the phone search", async (label, view) => {
      usePhone();
      const user = userEvent.setup();
      render(<SearchView />);

      await user.click(screen.getByRole("button", { name: label }));

      expect(useNavigation.getState().view).toEqual(view);
      expect(useNavigation.getState().navPast.at(-1)?.view).toEqual({ name: "search" });
    });

    it("does not show the browse entries on desktop", () => {
      render(<SearchView />);

      expect(screen.queryByRole("heading", { name: "Browse all" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Explore" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Charts" })).toBeNull();
      expect(screen.queryByRole("button", { name: "New releases" })).toBeNull();
    });

    it("hides the browse entries while a query is typed", async () => {
      usePhone();
      cachedSearchPage.mockResolvedValue({ rows: [songRow("s1", "Physical")], continuation: null });
      useUI.setState({ searchQuery: "dua" });
      render(<SearchView />);

      await screen.findByRole("button", { name: /^Physical/ });

      expect(screen.queryByRole("heading", { name: "Browse all" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Explore" })).toBeNull();
    });
  });
});

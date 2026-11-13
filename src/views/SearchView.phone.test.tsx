import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  audio,
  playStream,
  seekTo,
  cachedSearchPage,
  peekSearchPage,
  searchMore,
  peekTypeAhead,
  typeAhead,
  recogniseSong,
  freshMoods,
  loadMoods,
  getMoodCovers,
  useCoverFill,
} = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
  cachedSearchPage: vi.fn(),
  peekSearchPage: vi.fn(),
  searchMore: vi.fn(),
  peekTypeAhead: vi.fn(),
  typeAhead: vi.fn(),
  recogniseSong: vi.fn(),
  freshMoods: vi.fn(),
  loadMoods: vi.fn(),
  getMoodCovers: vi.fn(),
  useCoverFill: vi.fn((_src: string): string | null => null),
}));

vi.mock("../lib/explore", () => ({ freshMoods, loadMoods, getMoodCovers }));

vi.mock("../components/phone/useCoverFill", () => ({ useCoverFill }));

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  recogniseSong,
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

vi.mock("../lib/search", () => ({ cachedSearchPage, peekSearchPage, searchMore, peekTypeAhead, typeAhead }));

import { SearchView } from "./SearchView";
import type { SearchRow, SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecentItems, useRecents, type RecentItem } from "../stores/recents";
import { useUI } from "../stores/ui";
import { FALLBACK_MOODS, type MoodEntry } from "../lib/moods";

const initialPlayer = usePlayer.getState();

const MOODS: MoodEntry[] = [
  { title: "Chill mix", browseId: "FEmusic_moods", params: "chill", color: null, section: null },
  { title: "Focus flow", browseId: "", params: null, color: null, section: null },
  ...Array.from({ length: 10 }, (_, index): MoodEntry => ({
    title: `Genre ${index}`,
    browseId: "FEmusic_moods",
    params: `g${index}`,
    color: null,
    section: null,
  })),
];

function artist(id: string): RecentItem {
  return { kind: "artist", id, title: `Artist ${id}`, subtitle: "1M subscribers", thumb: null };
}

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

describe("SearchView on the phone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playStream.mockResolvedValue(undefined);
    peekSearchPage.mockReturnValue(undefined);
    peekTypeAhead.mockReturnValue(undefined);
    typeAhead.mockReturnValue(new Promise(() => {}));
    cachedSearchPage.mockReturnValue(new Promise(() => {}));
    recogniseSong.mockReturnValue(new Promise(() => {}));
    freshMoods.mockReturnValue(null);
    loadMoods.mockReturnValue(new Promise(() => {}));
    getMoodCovers.mockReturnValue(new Promise(() => {}));
    useCoverFill.mockReturnValue(null);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all" });
    useRecents.setState({ searches: [] });
    useRecentItems.setState({ items: [] });
    useNavigation.setState({ view: { name: "search" } });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a search field at the top of the view", () => {
    render(<SearchView />);

    const field = screen.getByRole("searchbox", { name: "Search" });
    expect(field.getAttribute("placeholder")).toBe("What do you want to play?");
    expect(field.getAttribute("enterkeyhint")).toBe("search");
  });

  it("shows exactly one clear button, and only while there is text", async () => {
    const user = userEvent.setup();
    render(<SearchView />);

    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "dua");

    expect(screen.getAllByRole("button", { name: "Clear search" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(useUI.getState().searchQuery).toBe("");
  });

  it("puts the recognise action in the field and drops the big card", async () => {
    const user = userEvent.setup();
    render(<SearchView />);

    expect(screen.queryByRole("region", { name: "Recognise a song" })).toBeNull();
    const mic = screen.getByRole("button", { name: "Recognise song" });
    expect(mic.className).toContain("h-12");

    await user.click(mic);

    expect(recogniseSong).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Play the song out loud/)).toBeTruthy();
  });

  it("shows results as the user types", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [{ kind: "track", track: song("s1", "Physical") }] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    await user.type(screen.getByRole("searchbox", { name: "Search" }), "phys");

    expect(await screen.findByRole("button", { name: /^Physical/ }, { timeout: 2000 })).toBeTruthy();
    expect(cachedSearchPage).toHaveBeenCalledWith("phys", "all");
    expect(screen.getByRole("button", { name: "Songs" }).className).toContain("h-[34px]");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the field focused across the switch from idle to results", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("searchbox", { name: "Search" });
    await user.click(field);
    await user.type(field, "x");

    expect(screen.getByRole("searchbox", { name: "Search" })).toBe(field);
    expect(document.activeElement).toBe(field);
  });

  it("submits the typed query on Enter", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("searchbox", { name: "Search" });
    await user.type(field, "daft punk");
    fireEvent.keyDown(field, { key: "Enter" });

    expect(useRecents.getState().searches).toContain("daft punk");
  });

  it("shows the Search title with the profile button above the field", () => {
    render(<SearchView />);

    const title = screen.getByRole("heading", { name: "Search" });
    expect(title.compareDocumentPosition(screen.getByRole("searchbox", { name: "Search" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Profile and settings" })).toBeTruthy();
  });

  it("hides the Search title while results are shown and keeps the field", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("searchbox", { name: "Search" });
    await user.type(field, "x");

    expect(screen.queryByRole("heading", { name: "Search" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search" })).toBe(field);
  });

  it("puts recent searches in one horizontal row", () => {
    useRecents.setState({ searches: ["daft punk", "dua lipa"] });
    render(<SearchView />);

    const row = screen.getByRole("button", { name: "daft punk" }).parentElement?.parentElement;
    expect(row?.className).toContain("overflow-x-auto");
    expect(screen.getByRole("button", { name: "daft punk" }).parentElement?.className).toContain("shrink-0");
  });

  it("shows at most six recently opened items", () => {
    useRecentItems.setState({ items: Array.from({ length: 8 }, (_, index) => artist(`a${index}`)) });
    render(<SearchView />);

    expect(screen.getAllByRole("button", { name: /from recently opened/ })).toHaveLength(6);
  });

  it("lists the browse tiles under Browse all", async () => {
    freshMoods.mockReturnValue(MOODS);
    const user = userEvent.setup();
    render(<SearchView />);

    expect(screen.getByRole("heading", { name: "Browse all" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Charts" }));
    expect(useNavigation.getState().view).toEqual({ name: "charts" });
  });

  it.each([
    ["Explore", { name: "explore" }],
    ["New releases", { name: "newreleases" }],
  ])("opens %s from Browse all", async (label, view) => {
    const user = userEvent.setup();
    render(<SearchView />);

    await user.click(screen.getByRole("button", { name: label }));

    expect(useNavigation.getState().view).toEqual(view);
  });

  it("shows at most ten mood and genre tiles", () => {
    freshMoods.mockReturnValue(MOODS);
    render(<SearchView />);

    expect(screen.getByRole("button", { name: "Chill mix" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Genre 7" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Genre 8" })).toBeNull();
  });

  it("opens a mood with params on its page and sets the query for one without", async () => {
    freshMoods.mockReturnValue(MOODS);
    const user = userEvent.setup();
    render(<SearchView />);

    await user.click(screen.getByRole("button", { name: "Chill mix" }));
    expect(useNavigation.getState().view).toEqual({ name: "mood", param: "chill" });

    await user.click(screen.getByRole("button", { name: "Focus flow" }));
    expect(useUI.getState().searchQuery).toBe("Focus flow");
  });

  it("shows placeholder tiles and no mood names until the moods load", () => {
    const { container } = render(<SearchView />);

    for (const mood of FALLBACK_MOODS) {
      expect(screen.queryByRole("button", { name: mood.title })).toBeNull();
    }
    expect(container.querySelectorAll(".bt-skeleton > div")).toHaveLength(8);
  });

  it("swaps the placeholders for the loaded moods", async () => {
    loadMoods.mockResolvedValue(MOODS);
    const { container } = render(<SearchView />);

    expect(await screen.findByRole("button", { name: "Chill mix" })).toBeTruthy();
    expect(container.querySelector(".bt-skeleton")).toBeNull();
  });

  it("paints a mood tile with its cover colour and a thumbnail instead of a full-bleed image", async () => {
    freshMoods.mockReturnValue([MOODS[0]]);
    getMoodCovers.mockResolvedValue(["https://i.ytimg.com/vi/abc/hqdefault.jpg"]);
    useCoverFill.mockReturnValue("rgb(10, 20, 30)");
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        callback: (entries: { isIntersecting: boolean }[]) => void;
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          this.callback = callback;
        }
        observe() {
          this.callback([{ isIntersecting: true }]);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    render(<SearchView />);

    const tile = await screen.findByRole("button", { name: "Chill mix" });
    const thumb = await waitFor(() => {
      const image = tile.querySelector("img");
      if (!image) throw new Error("thumbnail not shown yet");
      return image;
    });
    expect(tile.style.backgroundColor).toBe("rgb(10, 20, 30)");
    expect(thumb.getAttribute("alt")).toBe("");
    expect(thumb.className).toContain("size-14");
    expect(tile.querySelector("span.absolute")?.className).toContain("right-[80px]");
    expect(useCoverFill).toHaveBeenCalledWith(thumb.getAttribute("src"));
    expect(tile.querySelector(".absolute.inset-0")).toBeNull();
  });
});

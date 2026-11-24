import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
} = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
  cachedSearchPage: vi.fn(),
  peekSearchPage: vi.fn(),
  searchMore: vi.fn(),
  peekTypeAhead: vi.fn(),
  typeAhead: vi.fn(),
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

vi.mock("../lib/search", () => ({ cachedSearchPage, peekSearchPage, searchMore, peekTypeAhead, typeAhead }));

import { SearchView } from "./SearchView";
import type { SearchRow, SearchSong } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecentItems, useRecents, type RecentItem } from "../stores/recents";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();

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
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all", searchFocused: false });
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

    const field = screen.getByRole("combobox", { name: "Search" });
    expect(field.getAttribute("placeholder")).toBe("What do you want to play?");
    expect(field.getAttribute("enterkeyhint")).toBe("search");
  });

  it("shows exactly one clear button, and only while there is text", async () => {
    const user = userEvent.setup();
    render(<SearchView />);

    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    await user.type(screen.getByRole("combobox", { name: "Search" }), "dua");

    expect(screen.getAllByRole("button", { name: "Clear search" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(useUI.getState().searchQuery).toBe("");
  });

  it("shows results as the user types", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [{ kind: "track", track: song("s1", "Physical") }] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("combobox", { name: "Search" });
    await user.type(field, "phys");
    fireEvent.keyDown(field, { key: "Escape" });

    expect(await screen.findByRole("button", { name: /^Physical/ }, { timeout: 2000 })).toBeTruthy();
    expect(cachedSearchPage).toHaveBeenCalledWith("phys", "all");
    expect(screen.getByRole("button", { name: "Songs" }).className).toContain("h-[34px]");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the field focused across the switch from idle to results", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("combobox", { name: "Search" });
    await user.click(field);
    await user.type(field, "x");

    expect(screen.getByRole("combobox", { name: "Search" })).toBe(field);
    expect(document.activeElement).toBe(field);
  });

  it("submits the typed query on Enter", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("combobox", { name: "Search" });
    await user.type(field, "daft punk");
    fireEvent.keyDown(field, { key: "Enter" });

    expect(useRecents.getState().searches).toContain("daft punk");
  });

  it("shows the Search title with the profile button above the field", () => {
    render(<SearchView />);

    const title = screen.getByRole("heading", { name: "Search" });
    expect(title.compareDocumentPosition(screen.getByRole("combobox", { name: "Search" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Profile and settings" })).toBeTruthy();
  });

  it("hides the Search title while results are shown and keeps the field", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [] as SearchRow[], continuation: null });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("combobox", { name: "Search" });
    await user.type(field, "x");

    expect(screen.queryByRole("heading", { name: "Search" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Search" })).toBe(field);
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

  it("has no Browse all section", () => {
    render(<SearchView />);

    expect(screen.queryByRole("heading", { name: "Browse all" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Charts" })).toBeNull();
  });

  it("selects the existing text when the field is tapped so typing replaces it", () => {
    useUI.setState({ searchQuery: "arijit" });
    render(<SearchView />);

    const field = screen.getByRole("combobox", { name: "Search" }) as HTMLInputElement;
    act(() => field.focus());

    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe("arijit".length);
  });

  it("Cancel restores the previous query, blurs the field and brings the results back", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [{ kind: "track", track: song("s1", "Physical") }] as SearchRow[], continuation: null });
    useUI.setState({ searchQuery: "arijit" });
    const user = userEvent.setup();
    render(<SearchView />);

    const field = screen.getByRole("combobox", { name: "Search" });
    act(() => field.focus());
    await user.keyboard("zz");
    expect(useUI.getState().searchQuery).toBe("zz");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(useUI.getState().searchQuery).toBe("arijit");
    expect(useUI.getState().searchFocused).toBe(false);
    expect(document.activeElement).not.toBe(field);
    expect(await screen.findByRole("button", { name: /^Physical/ }, { timeout: 2000 })).toBeTruthy();
  });

  it("replaces the results with suggestions while the field is focused", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [{ kind: "track", track: song("s1", "Physical") }] as SearchRow[], continuation: null });
    typeAhead.mockResolvedValue([{ kind: "completion", text: "arijit singh" }]);
    useUI.setState({ searchQuery: "arijit" });
    render(<SearchView />);

    expect(await screen.findByRole("button", { name: /^Physical/ }, { timeout: 2000 })).toBeTruthy();
    act(() => screen.getByRole("combobox", { name: "Search" }).focus());

    expect(await screen.findByRole("option", { name: "arijit singh" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Physical/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
  });

  it("offers recent searches when the empty field is focused", () => {
    useRecents.setState({ searches: ["daft punk"] });
    render(<SearchView />);

    act(() => screen.getByRole("combobox", { name: "Search" }).focus());

    expect(screen.getByRole("option", { name: "daft punk" })).toBeTruthy();
  });
});

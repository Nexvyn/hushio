import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PODCASTS_ENABLED } from "../lib/features";

const { loadMoods, freshMoods, getMoodCovers } = vi.hoisted(() => ({
  loadMoods: vi.fn(),
  freshMoods: vi.fn(),
  getMoodCovers: vi.fn(),
}));

vi.mock("../lib/explore", () => ({ loadMoods, freshMoods, getMoodCovers }));

const { loadPodcasts, freshPodcasts } = vi.hoisted(() => ({
  loadPodcasts: vi.fn(),
  freshPodcasts: vi.fn(),
}));

vi.mock("../lib/podcasts", () => ({ loadPodcasts, freshPodcasts }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { ExploreView } from "./ExploreView";
import { useExploreCovers } from "../lib/exploreCovers";
import type { MoodEntry } from "../lib/moods";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const CATEGORY = "FEmusic_moods_and_genres_category";
const COVER = "https://lh3.googleusercontent.com/a=s60";

const moods: MoodEntry[] = [
  { title: "Focus", browseId: CATEGORY, params: "p-focus", color: "#123456", section: "Moods" },
  { title: "Jazz", browseId: CATEGORY, params: "p-jazz", color: null, section: "Genres" },
];

const genres: MoodEntry[] = Array.from({ length: 38 }, (_, index) => ({
  title: `Genre ${index + 1}`,
  browseId: CATEGORY,
  params: `p-genre-${index + 1}`,
  color: null,
  section: "Genres",
}));

let observers: ((entries: { isIntersecting: boolean }[]) => void)[];

beforeEach(() => {
  vi.clearAllMocks();
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
  freshMoods.mockReturnValue(null);
  freshPodcasts.mockReturnValue(null);
  loadPodcasts.mockResolvedValue([]);
  useExploreCovers.setState({ byKey: {} });
  useNavigation.setState({ view: { name: "explore" }, navPast: [], navFuture: [] });
  useUI.setState({ searchQuery: "", searchFilter: "all" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExploreView", () => {
  it("shows the fallback moods until the provider answers", () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    render(<ExploreView />);
    expect(screen.getByRole("button", { name: "Today's hits" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chill mix" })).toBeTruthy();
  });

  it("groups moods under their section headings with a count", async () => {
    loadMoods.mockResolvedValue(moods);
    render(<ExploreView />);
    expect(await screen.findByRole("heading", { level: 2, name: /Genres/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /Moods/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Jazz" })).toBeTruthy();
  });

  it("loads a mood's covers only after its card scrolls into view", async () => {
    loadMoods.mockResolvedValue([moods[0]]);
    getMoodCovers.mockResolvedValue([COVER, COVER]);
    render(<ExploreView />);
    await screen.findByRole("button", { name: "Focus" });

    await waitFor(() => expect(observers).toHaveLength(1));
    expect(getMoodCovers).not.toHaveBeenCalled();

    act(() => observers[0]([{ isIntersecting: true }]));

    await waitFor(() => expect(getMoodCovers).toHaveBeenCalledWith(CATEGORY, "p-focus"));
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(1));
  });

  it("renders a mood as an artwork tile with its name over the image", async () => {
    loadMoods.mockResolvedValue([moods[0]]);
    getMoodCovers.mockResolvedValue([COVER]);
    render(<ExploreView />);
    const tile = await screen.findByRole("button", { name: "Focus" });
    await waitFor(() => expect(observers).toHaveLength(1));
    act(() => observers[0]([{ isIntersecting: true }]));
    await waitFor(() => expect(tile.querySelector("img")?.getAttribute("src")).toBe(COVER));
    expect(tile.className).toContain("aspect-[16/10]");
    expect(tile.className).toContain("rounded-[12px]");
    expect(tile.textContent).toBe("Focus");
  });

  it("renders a quiet fallback tile with the name when a mood has no artwork", () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    render(<ExploreView />);
    const tile = screen.getByRole("button", { name: "Today's hits" });
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.textContent).toBe("Today's hits");
    expect(tile.className).toContain("bg-wash");
  });

  it("uses no bordered row classes on tiles", async () => {
    loadMoods.mockResolvedValue(moods);
    render(<ExploreView />);
    const tile = await screen.findByRole("button", { name: "Jazz" });
    expect(tile.className).not.toMatch(/\bborder\b|\bh-14\b|\bbg-hover\b/);
    expect(tile.className).toContain("aspect-square");
  });

  it("shows the first 12 genres and expands in place", async () => {
    loadMoods.mockResolvedValue([...moods.slice(0, 1), ...genres]);
    render(<ExploreView />);
    const shown = () => screen.queryAllByRole("button", { name: /^Genre \d+$/ });
    await waitFor(() => expect(shown()).toHaveLength(12));
    expect(screen.getByRole("heading", { level: 2, name: /Genres\s*38/ })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Show all 38" }));
    expect(shown()).toHaveLength(38);

    await userEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(shown()).toHaveLength(12);
  });

  it("opens the mood page for a mood with params", async () => {
    loadMoods.mockResolvedValue(moods);
    render(<ExploreView />);
    await userEvent.click(await screen.findByRole("button", { name: "Jazz" }));
    expect(useNavigation.getState().view).toEqual({ name: "mood", param: "p-jazz" });
  });

  it("searches for a fallback mood, which has no params", async () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    render(<ExploreView />);
    await userEvent.click(screen.getByRole("button", { name: "Pop hits" }));
    expect(useUI.getState().searchQuery).toBe("Pop hits");
    expect(useNavigation.getState().view).toEqual({ name: "search" });
  });

  it("shows no Podcasts tile while podcasts are disabled", () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    render(<ExploreView />);
    expect(screen.queryByRole("button", { name: /Podcasts/ })).toBeNull();
    expect(loadPodcasts).not.toHaveBeenCalled();
  });

  it.skipIf(!PODCASTS_ENABLED)("opens Podcasts from the banner when podcasts are enabled", async () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    render(<ExploreView />);
    await userEvent.click(screen.getByRole("button", { name: /Podcasts/ }));
    expect(useNavigation.getState().view).toEqual({ name: "podcasts" });
  });

  it.skipIf(!PODCASTS_ENABLED)("shows the first show thumbnail on the podcasts tile when podcasts are enabled", async () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    const show = (n: number) => ({ id: `MPSP${n}`, title: `Show ${n}`, thumb: `${COVER}${n}`, author: null });
    loadPodcasts.mockResolvedValue([
      { title: "Shows", shows: [{ ...show(2), thumb: null }, show(3), show(4)], episodes: [] },
    ]);
    render(<ExploreView />);
    const banner = screen.getByRole("button", { name: /Podcasts/ });
    await waitFor(() => expect(banner.querySelectorAll("img")).toHaveLength(1));
    expect(banner.querySelector("img")?.getAttribute("src")).toBe(`${COVER}3`);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { loadMoods, freshMoods, getMoodCovers } = vi.hoisted(() => ({
  loadMoods: vi.fn(),
  freshMoods: vi.fn(),
  getMoodCovers: vi.fn(),
}));

vi.mock("../lib/explore", () => ({ loadMoods, freshMoods, getMoodCovers }));

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
    await waitFor(() => expect(document.querySelectorAll("img")).toHaveLength(2));
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

  it("opens Podcasts from the banner", async () => {
    loadMoods.mockReturnValue(new Promise(() => {}));
    render(<ExploreView />);
    await userEvent.click(screen.getByRole("button", { name: /Podcasts/ }));
    expect(useNavigation.getState().view).toEqual({ name: "podcasts" });
  });
});

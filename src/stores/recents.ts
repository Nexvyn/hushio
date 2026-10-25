import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";

export const RECENT_SEARCH_LIMIT = 12;
export const RECENT_ITEM_LIMIT = 30;

const TYPE_PREFIX = /^(artist|album|single|ep|playlist|song)\s*•\s*/i;

export function cleanSubtitle(subtitle: string): string {
  return subtitle.replace(TYPE_PREFIX, "").trim();
}

type RecentSearchesState = {
  searches: string[];
  pushSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearSearches: () => void;
};

export const useRecents = create<RecentSearchesState>()(
  persist(
    (set) => ({
      searches: [],
      pushSearch: (query) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set((state) => ({
          searches: [
            trimmed,
            ...state.searches.filter((search) => search.toLowerCase() !== trimmed.toLowerCase()),
          ].slice(0, RECENT_SEARCH_LIMIT),
        }));
      },
      removeSearch: (query) =>
        set((state) => ({ searches: state.searches.filter((search) => search !== query) })),
      clearSearches: () => set({ searches: [] }),
    }),
    { name: "recent-searches", storage: persistStorage<RecentSearchesState>("recent-searches") },
  ),
);

export type RecentKind = "song" | "artist" | "album" | "playlist";

export type RecentItem = {
  kind: RecentKind;
  id: string;
  title: string;
  subtitle: string;
  thumb: string | null;
};

type RecentItemsState = {
  items: RecentItem[];
  add: (item: RecentItem) => void;
  remove: (kind: RecentKind, id: string) => void;
  clear: () => void;
};

export const useRecentItems = create<RecentItemsState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) =>
        set((state) => ({
          items: [
            { ...item, subtitle: cleanSubtitle(item.subtitle) },
            ...state.items.filter((entry) => !(entry.kind === item.kind && entry.id === item.id)),
          ].slice(0, RECENT_ITEM_LIMIT),
        })),
      remove: (kind, id) =>
        set((state) => ({
          items: state.items.filter((entry) => !(entry.kind === kind && entry.id === id)),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "recent-items", storage: persistStorage<RecentItemsState>("recent-items") },
  ),
);

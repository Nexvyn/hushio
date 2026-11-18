import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HomeShelf } from "../lib/home";
import { persistStorage } from "../lib/persist";

type HomeCacheState = {
  market: string | null;
  language: string;
  shelves: HomeShelf[];
  fetchedAt: number | null;
  continuation: string | null;
  save: (market: string, shelves: HomeShelf[], continuation?: string | null, language?: string) => void;
};

export const useHomeCache = create<HomeCacheState>()(
  persist(
    (set) => ({
      market: null,
      language: "en",
      shelves: [],
      fetchedAt: null,
      continuation: null,
      save: (market, shelves, continuation = null, language = "en") => set({ market, language, shelves, continuation, fetchedAt: Date.now() }),
    }),
    {
      name: "home-market-cache",
      version: 1,
      migrate: (persisted) => persisted as HomeCacheState,
      storage: persistStorage<HomeCacheState>("home-market-cache"),
    },
  ),
);

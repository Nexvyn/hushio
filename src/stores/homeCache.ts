import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { HomeShelf } from "../lib/home";
import { persistStorage } from "../lib/persist";

type HomeCacheState = {
  market: string | null;
  shelves: HomeShelf[];
  fetchedAt: number | null;
  save: (market: string, shelves: HomeShelf[]) => void;
};

export const useHomeCache = create<HomeCacheState>()(
  persist(
    (set) => ({
      market: null,
      shelves: [],
      fetchedAt: null,
      save: (market, shelves) => set({ market, shelves, fetchedAt: Date.now() }),
    }),
    { name: "home-market-cache", storage: persistStorage<HomeCacheState>("home-market-cache") },
  ),
);

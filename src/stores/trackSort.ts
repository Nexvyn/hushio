import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";
import { CUSTOM_SORT, type TrackSort } from "../lib/trackSort";

type TrackSortState = {
  sorts: Record<string, TrackSort>;
  setSort: (key: string, sort: TrackSort) => void;
};

export const useTrackSort = create<TrackSortState>()(
  persist(
    (set) => ({
      sorts: {},
      setSort: (key, sort) => set((state) => ({ sorts: { ...state.sorts, [key]: sort } })),
    }),
    {
      name: "track-sorts",
      version: 1,
      migrate: (persisted) => persisted as TrackSortState,
      storage: persistStorage<TrackSortState>("track-sorts"),
    },
  ),
);

export function useStoredTrackSort(key: string, fallback: TrackSort = CUSTOM_SORT): [TrackSort, (sort: TrackSort) => void] {
  const sort = useTrackSort((state) => state.sorts[key] ?? fallback);
  return [sort, (next) => useTrackSort.getState().setSort(key, next)];
}

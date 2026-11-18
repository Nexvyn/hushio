import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Engagement, hideSong, recordTap } from "../lib/engagement";
import { persistStorage } from "../lib/persist";

type HomeEngagementState = Engagement & {
  tap: (kind: string) => void;
  hideSong: (track: { id: string; artist: string }) => void;
};

export const useHomeEngagement = create<HomeEngagementState>()(
  persist(
    (set, get) => ({
      taps: {},
      hiddenTracks: {},
      hiddenArtists: {},
      tap: (kind) => set({ taps: recordTap(get().taps, kind, Date.now()) }),
      hideSong: (track) => set((state) => hideSong(state, track, Date.now())),
    }),
    {
      name: "home-engagement",
      version: 1,
      migrate: (persisted) => persisted as Engagement,
      storage: persistStorage<Engagement>("home-engagement"),
      partialize: ({ taps, hiddenTracks, hiddenArtists }) => ({ taps, hiddenTracks, hiddenArtists }),
    },
  ),
);

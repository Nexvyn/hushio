import { create } from "zustand";
import type { StreamDetails } from "../lib/streamStats";

type NowStreamState = {
  trackId: string | null;
  details: StreamDetails | null;
  publish: (trackId: string, details: StreamDetails | null) => void;
};

export const useNowStream = create<NowStreamState>()((set) => ({
  trackId: null,
  details: null,
  publish: (trackId, details) => set({ trackId, details }),
}));

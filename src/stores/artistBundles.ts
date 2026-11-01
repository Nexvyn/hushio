import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ArtistBundle } from "../lib/artistBundle";
import { persistStorage } from "../lib/persist";

export const BUNDLE_MAX = 24;

export function keepNewest(bundles: Record<string, ArtistBundle>, max = BUNDLE_MAX): Record<string, ArtistBundle> {
  const newest = Object.values(bundles)
    .sort((a, b) => b.fetchedAt - a.fetchedAt)
    .slice(0, max);
  return Object.fromEntries(newest.map((bundle) => [bundle.artistId, bundle]));
}

type ArtistBundlesState = {
  bundles: Record<string, ArtistBundle>;
  put: (bundle: ArtistBundle) => void;
};

export const useArtistBundles = create<ArtistBundlesState>()(
  persist(
    (set) => ({
      bundles: {},
      put: (bundle) => set((state) => ({ bundles: keepNewest({ ...state.bundles, [bundle.artistId]: bundle }) })),
    }),
    { name: "artist-bundle-cache", storage: persistStorage<ArtistBundlesState>("artist-bundle-cache") },
  ),
);

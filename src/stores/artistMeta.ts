import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";

export const ARTIST_META_MAX = 400;
export const ARTIST_META_FRESH_MS = 30 * 86_400_000;

export type ArtistMeta = { id: string; name: string; thumb: string | null; resolvedAt: number };

type ArtistMetaState = {
  byName: Record<string, ArtistMeta>;
  put: (meta: ArtistMeta) => void;
};

export function artistNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function isPlaceholder(key: string): boolean {
  return key === "" || key === "unknown artist";
}

export const useArtistMeta = create<ArtistMetaState>()(
  persist(
    (set) => ({
      byName: {},
      put: (meta) =>
        set((state) => {
          const key = artistNameKey(meta.name);
          if (isPlaceholder(key)) return state;
          const byName = { ...state.byName, [key]: meta };
          const overflow = Object.keys(byName).length - ARTIST_META_MAX;
          if (overflow > 0) {
            const oldest = Object.entries(byName)
              .sort((a, b) => a[1].resolvedAt - b[1].resolvedAt)
              .slice(0, overflow);
            for (const [oldKey] of oldest) delete byName[oldKey];
          }
          return { byName };
        }),
    }),
    { name: "artist-meta-cache", storage: persistStorage<ArtistMetaState>("artist-meta-cache") },
  ),
);

export function rememberArtist(artist: { id: string; name: string; thumb: string | null }, now = Date.now()): void {
  useArtistMeta.getState().put({ ...artist, resolvedAt: now });
}

export function peekArtistMeta(name: string, now = Date.now()): ArtistMeta | null {
  const key = artistNameKey(name);
  if (isPlaceholder(key)) return null;
  const meta = useArtistMeta.getState().byName[key];
  return meta && now - meta.resolvedAt < ARTIST_META_FRESH_MS ? meta : null;
}

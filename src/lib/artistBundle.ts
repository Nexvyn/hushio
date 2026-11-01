import { getArtistPage } from "./browse";
import type { ArtistPage } from "./browseParse";
import type { Track } from "../types";
import { useArtistBundles } from "../stores/artistBundles";

export const BUNDLE_TTL_MS = 12 * 3_600_000;
const TOP_SONGS = 24;
const ALBUM_MAX = 14;
const RELATED_MAX = 12;

export type ArtistRef = { id: string; name: string; thumb: string | null };
export type AlbumRef = { id: string; title: string; artist: string; thumb: string | null; year: string | null };
export type ArtistBundle = {
  artistId: string;
  name: string;
  thumb: string | null;
  topSongs: Track[];
  albums: AlbumRef[];
  related: ArtistRef[];
  fetchedAt: number;
};

const inflight = new Map<string, Promise<ArtistBundle | null>>();

export function bundleFromPage(page: ArtistPage, now: number): ArtistBundle {
  const albums: AlbumRef[] = [];
  const related: ArtistRef[] = [];
  const albumIds = new Set<string>();
  const relatedIds = new Set<string>();
  for (const shelf of page.shelves) {
    for (const item of shelf.items) {
      if (item.kind === "album" && !albumIds.has(item.id) && albums.length < ALBUM_MAX) {
        albumIds.add(item.id);
        albums.push({ id: item.id, title: item.title, artist: item.artist, thumb: item.thumb, year: null });
      }
      if (item.kind === "artist" && item.id !== page.artist.id && !relatedIds.has(item.id) && related.length < RELATED_MAX) {
        relatedIds.add(item.id);
        related.push({ id: item.id, name: item.name, thumb: item.thumb });
      }
    }
  }
  return {
    artistId: page.artist.id,
    name: page.artist.name,
    thumb: page.artist.thumb,
    topSongs: page.songs.slice(0, TOP_SONGS).map(({ id, title, artist, thumb }) => ({ id, title, artist, thumb })),
    albums,
    related,
    fetchedAt: now,
  };
}

export function isFresh(bundle: ArtistBundle, now: number): boolean {
  return now - bundle.fetchedAt < BUNDLE_TTL_MS;
}

export function peekBundle(artistId: string): ArtistBundle | null {
  return useArtistBundles.getState().bundles[artistId] ?? null;
}

export function getArtistBundle(artistId: string, now = Date.now()): Promise<ArtistBundle | null> {
  if (!artistId) return Promise.resolve(null);
  const cached = peekBundle(artistId);
  if (cached && isFresh(cached, now)) return Promise.resolve(cached);
  const pending = inflight.get(artistId);
  if (pending) return pending;
  const load = getArtistPage(artistId)
    .then((page) => {
      const bundle = bundleFromPage(page, Date.now());
      useArtistBundles.getState().put(bundle);
      return bundle;
    })
    .catch(() => null)
    .finally(() => inflight.delete(artistId));
  inflight.set(artistId, load);
  return load;
}

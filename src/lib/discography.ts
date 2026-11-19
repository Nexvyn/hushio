import { getArtistPage, getReleaseGrid } from "./browse";
import type { ArtistPage, ReleaseKind } from "./browseParse";
import type { HomeItem, HomeShelf } from "./home";

export type Release = { id: string; title: string; thumb: string | null; year: string | null; type: ReleaseKind };
export type Discography = { artistName: string; releases: Release[] };
export type ReleaseFilter = "all" | "albums" | "singles" | "compilations";

export const MORE_BY_MAX = 12;

const RELEASE_SHELF = /album|single|\bep|compil/i;
const artistPages = new Map<string, Promise<ArtistPage>>();
const discographies = new Map<string, Promise<Discography>>();

export function isReleaseShelf(title: string): boolean {
  return RELEASE_SHELF.test(title);
}

function typeFromShelf(title: string): ReleaseKind {
  if (/compil/i.test(title)) return "Compilation";
  if (/single|\bep/i.test(title)) return "Single";
  return "Album";
}

function remember<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached;
  const entry = load();
  cache.set(key, entry);
  entry.catch(() => cache.delete(key));
  return entry;
}

function artistPageOf(artistId: string): Promise<ArtistPage> {
  return remember(artistPages, artistId, () => getArtistPage(artistId));
}

function albumItems(items: HomeItem[]): Extract<HomeItem, { kind: "album" }>[] {
  return items.filter((item): item is Extract<HomeItem, { kind: "album" }> => item.kind === "album");
}

async function releasesOfShelf(shelf: HomeShelf): Promise<Release[]> {
  const fallbackType = typeFromShelf(shelf.title);
  const fromItems = (): Release[] =>
    albumItems(shelf.items).map((item) => ({ id: item.id, title: item.title, thumb: item.thumb, year: null, type: fallbackType }));
  if (!shelf.more) return fromItems();
  const grid = await getReleaseGrid(shelf.more).catch(() => null);
  if (grid === null || grid.length === 0) return fromItems();
  return grid.map((card) => ({ id: card.id, title: card.title, thumb: card.thumb, year: card.year, type: card.type ?? fallbackType }));
}

function uniqueById(releases: Release[]): Release[] {
  const seen = new Map<string, Release>();
  for (const release of releases) if (!seen.has(release.id)) seen.set(release.id, release);
  return [...seen.values()];
}

function newestFirst(releases: Release[]): Release[] {
  const yearOf = (release: Release) => (release.year ? Number(release.year) : -1);
  return [...releases].sort((a, b) => yearOf(b) - yearOf(a));
}

async function loadDiscography(artistId: string): Promise<Discography> {
  const page = await artistPageOf(artistId);
  const shelves = page.shelves.filter((shelf) => isReleaseShelf(shelf.title));
  const groups = await Promise.all(shelves.map(releasesOfShelf));
  return { artistName: page.artist.name, releases: newestFirst(uniqueById(groups.flat())) };
}

export function getDiscography(artistId: string): Promise<Discography> {
  return remember(discographies, artistId, () => loadDiscography(artistId));
}

export function filterReleases(releases: Release[], filter: ReleaseFilter): Release[] {
  switch (filter) {
    case "all":
      return releases;
    case "albums":
      return releases.filter((release) => release.type === "Album");
    case "singles":
      return releases.filter((release) => release.type === "Single" || release.type === "EP");
    case "compilations":
      return releases.filter((release) => release.type === "Compilation");
  }
}

export function availableFilters(releases: Release[]): ReleaseFilter[] {
  return (["all", "albums", "singles", "compilations"] as const).filter(
    (filter) => filter === "all" || filterReleases(releases, filter).length > 0,
  );
}

export async function getMoreByArtist(artistId: string, excludeId: string): Promise<HomeShelf | null> {
  const page = await artistPageOf(artistId);
  const items = page.shelves
    .filter((shelf) => isReleaseShelf(shelf.title))
    .flatMap((shelf) => albumItems(shelf.items))
    .filter((item) => item.id !== excludeId);
  const unique = [...new Map(items.map((item) => [item.id, item])).values()].slice(0, MORE_BY_MAX);
  return unique.length > 0 ? { title: `More by ${page.artist.name}`, items: unique } : null;
}

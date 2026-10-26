import { asArray, at, isRecord, text, type Json } from "./innertube";
import { browse, thumbOf } from "./explore";
import { MOOD_BROWSE_ID } from "./moods";
import { buildMix } from "./moodMix";
import { parseSearchPage, type BrowseItem, type SearchSong } from "./searchParse";

export type MoodCardItem = { id: string; title: string; subtitle: string; thumb: string | null };

export type MoodItem = {
  track?: SearchSong;
  playlist?: MoodCardItem;
  album?: MoodCardItem;
  artist?: MoodCardItem;
};

export type MoodShelf = { title: string; items: MoodItem[] };

export type MoodPage = { title: string; shelves: MoodShelf[] };

type CardKind = "playlist" | "album" | "artist";

const PLAYLIST_ID = /^(VL|PL|OLAK5uy)/;
const PAGE_TTL_MS = 3_600_000;
const MIX_TTL_MS = 3_600_000;
const MIX_SOURCES = 3;

const pages = new Map<string, { page: MoodPage; at: number }>();
const mixes = new Map<string, { tracks: SearchSong[]; at: number }>();

function cardKindOf(browseId: string): CardKind | null {
  if (browseId.startsWith("UC")) return "artist";
  if (browseId.startsWith("MPRE")) return "album";
  return PLAYLIST_ID.test(browseId) ? "playlist" : null;
}

function itemOfKind(kind: CardKind, card: MoodCardItem): MoodItem {
  if (kind === "artist") return { artist: card };
  if (kind === "album") return { album: card };
  return { playlist: card };
}

function cardItemOf(card: Json): MoodItem | null {
  const id = at(card, "navigationEndpoint", "browseEndpoint", "browseId");
  const kind = typeof id === "string" ? cardKindOf(id) : null;
  const title = text(card.title).trim();
  if (typeof id !== "string" || !kind || !title) return null;
  return itemOfKind(kind, { id, title, subtitle: text(card.subtitle).trim(), thumb: thumbOf(card) });
}

function rowItemOf(node: unknown): MoodItem | null {
  const card = at(node, "musicTwoRowItemRenderer");
  if (isRecord(card)) return cardItemOf(card);
  const row = parseSearchPage({ contents: [node] }, false).rows[0];
  if (row?.kind === "track") return { track: row.track };
  if (row?.kind !== "browse") return null;
  const item: BrowseItem = row.item;
  if (item.type !== "artist" && item.type !== "album" && item.type !== "playlist") return null;
  return itemOfKind(item.type, {
    id: item.browseId,
    title: item.title,
    subtitle: item.subtitle,
    thumb: item.thumb,
  });
}

function shelfOf(title: string, nodes: unknown[]): MoodShelf | null {
  const items = nodes.flatMap((node) => {
    const item = rowItemOf(node);
    return item ? [item] : [];
  });
  return title && items.length > 0 ? { title, items } : null;
}

function sectionOf(section: unknown): MoodShelf | null {
  const carousel = at(section, "musicCarouselShelfRenderer");
  if (isRecord(carousel)) {
    return shelfOf(
      text(at(carousel, "header", "musicCarouselShelfBasicHeaderRenderer", "title")).trim(),
      asArray(carousel.contents),
    );
  }
  const grid = at(section, "gridRenderer");
  if (isRecord(grid)) {
    return shelfOf(text(at(grid, "header", "gridHeaderRenderer", "title")).trim(), asArray(grid.items));
  }
  const list = at(section, "musicShelfRenderer");
  if (isRecord(list)) return shelfOf(text(list.title).trim(), asArray(list.contents));
  return null;
}

export function parseMoodPage(data: unknown): MoodPage | null {
  const tab = asArray(at(data, "contents", "singleColumnBrowseResultsRenderer", "tabs")).at(0);
  const sections = asArray(at(tab, "tabRenderer", "content", "sectionListRenderer", "contents"));
  if (sections.length === 0) return null;
  const shelves = sections.flatMap((section) => {
    const shelf = sectionOf(section);
    return shelf ? [shelf] : [];
  });
  return { title: text(at(data, "header", "musicHeaderRenderer", "title")).trim(), shelves };
}

export function peekMoodPage(params: string, now = Date.now()): MoodPage | undefined {
  const entry = pages.get(params);
  return entry && now - entry.at < PAGE_TTL_MS ? entry.page : undefined;
}

export async function loadMoodPage(params: string, now = Date.now()): Promise<MoodPage | null> {
  const fresh = peekMoodPage(params, now);
  if (fresh) return fresh;
  try {
    const page = parseMoodPage(await browse(MOOD_BROWSE_ID, params));
    if (page && page.shelves.length > 0) pages.set(params, { page, at: now });
    return page;
  } catch {
    return pages.get(params)?.page ?? null;
  }
}

export async function getPlaylistTracks(id: string): Promise<SearchSong[]> {
  const browseId = PLAYLIST_ID.test(id) ? id : `VL${id}`;
  const rows = parseSearchPage(await browse(browseId), false).rows;
  return rows.flatMap((row) => (row.kind === "track" ? [row.track] : []));
}

export async function loadMix(
  params: string,
  songs: SearchSong[],
  playlists: MoodCardItem[],
  now = Date.now(),
): Promise<SearchSong[]> {
  const cached = mixes.get(params);
  if (cached && now - cached.at < MIX_TTL_MS) return cached.tracks;
  const lists = await Promise.all(
    playlists.slice(0, MIX_SOURCES).map((playlist) => getPlaylistTracks(playlist.id).catch(() => [])),
  );
  const tracks = buildMix(songs.length > 0 ? [songs, ...lists] : lists);
  if (tracks.length > 0) mixes.set(params, { tracks, at: now });
  return tracks;
}

import { upgradeArtwork } from "./artwork";
import {
  asArray,
  at,
  collect,
  getSession,
  getSearchSession,
  isRecord,
  radioVideoType,
  text,
  withRetry,
  type Json,
  type Market,
} from "./innertube";
import { marketValue } from "./market";
import { useHomeCache } from "../stores/homeCache";
import type { Track } from "../types";

export const HOME_PAGES = 4;
export const HOME_TTL_MS = 3_600_000;
export const HOME_SHELF_MAX = 8;
const SHELF_ITEM_MAX = 24;
const SHELF_MIN_ITEMS = 3;
const FALLBACK_TITLE = "For you";
const SEPARATOR = " • ";
const TYPE_WORDS = new Set(["song", "video", "episode", "album", "single", "ep", "artist", "playlist"]);

export type HomeItem =
  | { kind: "track"; track: Track }
  | { kind: "album"; id: string; title: string; artist: string; thumb: string | null }
  | { kind: "artist"; id: string; name: string; thumb: string | null }
  | { kind: "playlist"; id: string; title: string; subtitle: string; thumb: string | null };

export type ShelfMore = { browseId: string; params?: string };
export type HomeShelf = { title: string; items: HomeItem[]; more?: ShelfMore };
export type HomePage = { shelves: HomeShelf[]; continuation: string | null };

type Card = { renderer: Json; title: string; subtitle: string };

function thumbOf(renderer: Json): string | null {
  const thumbnails = asArray(at(collect(renderer, "musicThumbnailRenderer")[0], "thumbnail", "thumbnails"));
  const url = at(thumbnails.at(-1), "url");
  return typeof url === "string" ? upgradeArtwork(url) || null : null;
}

function artistOf(subtitle: string): string {
  const segment = subtitle
    .split(SEPARATOR)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !TYPE_WORDS.has(part.toLowerCase()));
  return segment ?? "";
}

function cardOf(entry: unknown): Card | null {
  const two = at(entry, "musicTwoRowItemRenderer");
  if (isRecord(two)) return { renderer: two, title: text(two.title).trim(), subtitle: text(two.subtitle).trim() };
  const row = at(entry, "musicResponsiveListItemRenderer");
  if (!isRecord(row)) return null;
  const columns = asArray(row.flexColumns).map((column) => at(column, "musicResponsiveListItemFlexColumnRenderer"));
  return { renderer: row, title: text(at(columns[0], "text")).trim(), subtitle: text(at(columns[1], "text")).trim() };
}

function itemOf({ renderer, title, subtitle }: Card): HomeItem | null {
  if (!title) return null;
  const endpoint = renderer.navigationEndpoint;
  const thumb = thumbOf(renderer);

  const browseId = at(endpoint, "browseEndpoint", "browseId");
  if (typeof browseId === "string") {
    const pageType = at(
      endpoint,
      "browseEndpoint",
      "browseEndpointContextSupportedConfigs",
      "browseEndpointContextMusicConfig",
      "pageType",
    );
    if (pageType === "MUSIC_PAGE_TYPE_ALBUM" || browseId.startsWith("MPRE")) {
      return { kind: "album", id: browseId, title, artist: artistOf(subtitle), thumb };
    }
    if (pageType === "MUSIC_PAGE_TYPE_ARTIST" || pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL" || browseId.startsWith("UC")) {
      return { kind: "artist", id: browseId, name: title, thumb };
    }
    if (pageType === "MUSIC_PAGE_TYPE_PLAYLIST" || browseId.startsWith("VL")) {
      return { kind: "playlist", id: browseId, title, subtitle, thumb };
    }
    return null;
  }

  const videoId = at(renderer, "playlistItemData", "videoId") ?? at(endpoint, "watchEndpoint", "videoId");
  if (typeof videoId !== "string" || radioVideoType(renderer) !== "song") return null;
  return { kind: "track", track: { id: videoId, title, artist: artistOf(subtitle), thumb } };
}

export function parseHomeShelves(data: unknown): HomeShelf[] {
  const shelves: HomeShelf[] = [];
  for (const shelf of collect(data, "musicCarouselShelfRenderer")) {
    const title = text(at(shelf, "header", "musicCarouselShelfBasicHeaderRenderer", "title")).trim();
    const items = asArray(shelf.contents)
      .map(cardOf)
      .flatMap((card) => {
        const item = card ? itemOf(card) : null;
        return item ? [item] : [];
      })
      .slice(0, SHELF_ITEM_MAX);
    if (items.length >= SHELF_MIN_ITEMS) shelves.push({ title: title || FALLBACK_TITLE, items });
  }
  return shelves;
}

export function homeContinuationOf(data: unknown): string | null {
  for (const section of [...collect(data, "sectionListRenderer"), ...collect(data, "sectionListContinuation")]) {
    const next = asArray(section.continuations).map(value => at(value, "nextContinuationData", "continuation"))
      .find((value): value is string => typeof value === "string");
    if (next) return next;
  }
  const token = collect(data, "nextContinuationData")
    .map((next) => at(next, "continuation"))
    .find((value): value is string => typeof value === "string");
  if (token) return token;
  const command = collect(data, "continuationCommand").find(value => typeof value.token === "string");
  return command && typeof command.token === "string" ? command.token : null;
}

export async function fetchHomePage(market: Market, continuation?: string): Promise<HomePage> {
  const { innertube } = await getSearchSession(market);
  const response = await withRetry(() => innertube.actions.execute("/browse", {
    ...(continuation ? { continuation } : { browseId: "FEmusic_home" }), client: "YTMUSIC",
  }));
  return { shelves: parseHomeShelves(response.data), continuation: homeContinuationOf(response.data) };
}

export async function fetchHomeShelves(market: Market): Promise<HomeShelf[]> {
  const { innertube } = await getSession(market);
  const first = await withRetry(() =>
    innertube.actions.execute("/browse", { browseId: "FEmusic_home", client: "YTMUSIC" }),
  );
  const shelves = parseHomeShelves(first.data);
  let token = homeContinuationOf(first.data);
  for (let page = 1; token && page < HOME_PAGES; page++) {
    const next = await innertube.actions.execute("/browse", { continuation: token, client: "YTMUSIC" }).catch(() => null);
    if (!next) break;
    shelves.push(...parseHomeShelves(next.data));
    token = homeContinuationOf(next.data);
  }
  return shelves.slice(0, HOME_SHELF_MAX);
}

function waitForCacheHydration(): Promise<void> {
  const cache = useHomeCache.persist;
  if (cache.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = cache.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

function warmSession(market: Market): void {
  getSession(market).catch((error: unknown) => {
    console.warn(`[hushio] session warm-up failed: ${String(error)}`);
  });
}

export async function refreshHome(force = false): Promise<HomeShelf[]> {
  await waitForCacheHydration();
  const region = marketValue();
  const { location } = region;
  const cache = useHomeCache.getState();
  const cachedForMarket = cache.market === location && cache.language === region.lang;
  if (!force && cachedForMarket && cache.fetchedAt !== null && Date.now() - cache.fetchedAt < HOME_TTL_MS) {
    warmSession(marketValue());
    return cache.shelves;
  }
  try {
    const page = await fetchHomePage(region);
    const current = marketValue();
    if (current.location === region.location && current.lang === region.lang) useHomeCache.getState().save(location, page.shelves, page.continuation, region.lang);
    return page.shelves;
  } catch (error) {
    if (cachedForMarket && cache.shelves.length > 0) return cache.shelves;
    throw error;
  }
}

export async function homeTracks(): Promise<Track[]> {
  const shelves = await refreshHome();
  return shelves.flatMap((shelf) => shelf.items.flatMap((item) => (item.kind === "track" ? [item.track] : [])));
}

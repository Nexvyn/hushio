import { upgradeArtwork } from "./artwork";
import { asArray, at, collect, getSession, isRecord, text, withRetry, type Json, type Market } from "./innertube";
import { parseSearchPage, type SearchSong } from "./searchParse";
import type { Track } from "../types";

export const CHARTS_BROWSE_ID = "FEmusic_charts";
export const CHARTS_PARAMS = "ggMGCgQIgAQ%3D";
export const NEW_RELEASES_BROWSE_ID = "FEmusic_new_releases";

export type ChartAlbum = {
  id: string;
  title: string;
  artist: string;
  year: string | null;
  thumb: string | null;
};

export type ChartShelf = {
  title: string;
  songs: SearchSong[];
  albums: ChartAlbum[];
};

export type ChartsPage = {
  shelves: ChartShelf[];
  continuation: string | null;
};

const SEPARATOR = "•";
const YEAR = /^\d{4}$/;

function thumbOf(node: unknown): string | null {
  const thumbnails = asArray(at(node, "thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"));
  const url = at(thumbnails.at(-1), "url");
  return typeof url === "string" ? upgradeArtwork(url) || null : null;
}

function albumOf(row: Json): ChartAlbum | null {
  const id = at(row, "navigationEndpoint", "browseEndpoint", "browseId");
  if (typeof id !== "string") return null;
  const title = text(row.title).trim();
  if (!title) return null;
  const segments = text(row.subtitle)
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  const year = segments.find((part) => YEAR.test(part)) ?? null;
  const artist = segments.filter((part) => !YEAR.test(part)).join(", ");
  return { id, title, artist, year, thumb: thumbOf(row) };
}

function songOf(row: Json): SearchSong | null {
  const columns = asArray(row.flexColumns).map((column) => at(column, "musicResponsiveListItemFlexColumnRenderer"));
  if (columns.length < 3) return null;
  const videoId = at(row, "playlistItemData", "videoId");
  if (typeof videoId !== "string") return null;
  const title = text(at(columns[0], "text")).trim();
  if (!title) return null;
  const artistRuns = asArray(at(columns[1], "text", "runs"));
  const artist = artistRuns
    .map((run) => String(at(run, "text") ?? ""))
    .filter(Boolean)
    .join(", ");
  const artistId =
    artistRuns
      .map((run) => at(run, "navigationEndpoint", "browseEndpoint", "browseId"))
      .find((value): value is string => typeof value === "string") ?? null;
  return {
    id: videoId,
    title,
    artist,
    artistId,
    albumId: null,
    album: null,
    thumb: thumbOf(row),
    duration: 0,
    explicit: false,
    isVideo: false,
  };
}

function shelfTitleOf(node: unknown, path: string[]): string {
  return text(at(node, ...path)).trim();
}

function shelfOf(node: Json, title: string): ChartShelf {
  const rows = asArray(node.contents ?? node.items);
  const songs: SearchSong[] = [];
  const albums: ChartAlbum[] = [];
  for (const entry of rows) {
    if (!isRecord(entry)) continue;
    const two = at(entry, "musicTwoRowItemRenderer");
    if (isRecord(two)) {
      const album = albumOf(two);
      if (album) albums.push(album);
      continue;
    }
    const list = at(entry, "musicResponsiveListItemRenderer");
    if (isRecord(list)) {
      const song = songOf(list);
      if (song) songs.push(song);
      continue;
    }
    const parsed = parseSearchPage({ contents: [entry] }, false).rows;
    for (const row of parsed) {
      if (row.kind === "track") songs.push(row.track);
    }
  }
  return { title, songs, albums };
}

export function parseChartsPage(data: unknown): ChartsPage {
  const shelves: ChartShelf[] = [];
  for (const node of collect(data, "musicCarouselShelfRenderer")) {
    const title = shelfTitleOf(node, ["header", "musicCarouselShelfBasicHeaderRenderer", "title"]) || "Charts";
    shelves.push(shelfOf(node, title));
  }
  for (const node of collect(data, "gridRenderer")) {
    const title = shelfTitleOf(node, ["header", "gridHeaderRenderer", "title"]) || "Charts";
    shelves.push(shelfOf(node, title));
  }
  const continuation =
    [
      ...collect(data, "nextContinuationData").map((next) => at(next, "continuation")),
      ...collect(data, "continuationCommand").map((command) => at(command, "token")),
    ].find((value): value is string => typeof value === "string") ?? null;
  return { shelves, continuation };
}

export function parseNewReleases(data: unknown): ChartShelf {
  const albums: ChartAlbum[] = [];
  for (const node of collect(data, "gridRenderer")) {
    for (const entry of asArray(node.items)) {
      if (!isRecord(entry)) continue;
      const two = at(entry, "musicTwoRowItemRenderer");
      if (!isRecord(two)) continue;
      const album = albumOf(two);
      if (album) albums.push(album);
    }
  }
  return { title: "New releases", songs: [], albums };
}

export async function fetchCharts(market: Market): Promise<ChartsPage> {
  const { innertube } = await getSession(market);
  const response = await withRetry(() =>
    innertube.actions.execute("/browse", {
      browseId: CHARTS_BROWSE_ID,
      params: CHARTS_PARAMS,
      client: "YTMUSIC",
    }),
  );
  return parseChartsPage(response.data);
}

export async function fetchNewReleases(market: Market): Promise<ChartShelf> {
  const { innertube } = await getSession(market);
  const response = await withRetry(() =>
    innertube.actions.execute("/browse", { browseId: NEW_RELEASES_BROWSE_ID, client: "YTMUSIC" }),
  );
  return parseNewReleases(response.data);
}

export function chartTracks(shelf: ChartShelf): Track[] {
  return shelf.songs.map((song) => ({
    id: song.id,
    title: song.title,
    artist: song.artist,
    thumb: song.thumb,
  }));
}

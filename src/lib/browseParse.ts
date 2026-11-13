import type { HomeItem, HomeShelf } from "./home";
import { upgradeArtwork } from "./artwork";
import { asArray, at, collect, isRecord, text, type Json } from "./innertube";
import { parseSearchPage, type SearchSong } from "./searchParse";
import type { Track } from "../types";

export const VIDEO_WORD = /\bvideos?\b/i;

const PLAYLIST_ID = /^(VL|PL|OLAK5uy)/;
const YEAR = /^\d{4}$/;
const RELEASE_TYPES = new Set(["album", "single", "ep"]);
const SEPARATOR = "•";
const BULLET_JOIN = " • ";
const PLAYLIST_HEADERS = ["musicResponsiveHeaderRenderer", "musicDetailHeaderRenderer"] as const;
const ARTIST_HEADERS = ["musicImmersiveHeaderRenderer", "musicVisualHeaderRenderer"] as const;
const EDITABLE_HEADER = "musicEditablePlaylistDetailHeaderRenderer";

export type ArtistInfo = { id: string; name: string; thumb: string | null };

export type ArtistPage = {
  artist: ArtistInfo;
  description: string | null;
  subscriberCount: string | null;
  monthlyListeners: string | null;
  songs: SearchSong[];
  shelves: HomeShelf[];
};

export type AlbumInfo = {
  id: string;
  title: string;
  artist: string;
  year: string | null;
  thumb: string | null;
  releaseType: string;
  description: string | null;
  artistId: string | null;
};

export type ReleasePage = {
  kind: "album" | "playlist" | "other";
  album: AlbumInfo;
  tracks: SearchSong[];
  continuation: string | null;
};

export type RemotePlaylistPage = {
  title: string;
  credit: string;
  year: string | null;
  thumb: string | null;
  tracks: SearchSong[];
  continuation: string | null;
};

export type ShelfPage = { songs: SearchSong[]; continuation: string | null };

type Credit = { id: string; name: string };

function segmentsOf(value: string): string[] {
  return value
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function deepFind(node: unknown, key: string): unknown {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = deepFind(child, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(node)) return undefined;
  if (key in node) return node[key];
  for (const child of Object.values(node)) {
    const found = deepFind(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function thumbOf(node: unknown): string | null {
  const url = at(asArray(deepFind(node, "thumbnails")).at(-1), "url");
  return typeof url === "string" ? upgradeArtwork(url) || null : null;
}

function headerNodesOf(data: unknown): unknown[] {
  const tab = asArray(at(data, "contents", "twoColumnBrowseResultsRenderer", "tabs")).at(0);
  const contents = asArray(at(tab, "tabRenderer", "content", "sectionListRenderer", "contents"));
  return [at(data, "header"), ...contents];
}

function headerOf(data: unknown, names: readonly string[]): Json | null {
  for (const node of headerNodesOf(data)) {
    for (const name of names) {
      const found = at(node, name);
      if (isRecord(found)) return found;
      const editable = at(node, EDITABLE_HEADER, "header", name);
      if (isRecord(editable)) return editable;
    }
  }
  return null;
}

function continuationOf(node: unknown): string | null {
  const tokens = [
    ...collect(node, "nextContinuationData").map((next) => at(next, "continuation")),
    ...collect(node, "continuationCommand").map((command) => at(command, "token")),
  ];
  const token = tokens.find((value): value is string => typeof value === "string");
  return token ?? null;
}

export function uniqueSongs(songs: SearchSong[]): SearchSong[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    if (seen.has(song.id)) return false;
    seen.add(song.id);
    return true;
  });
}

function songsOf(rows: unknown[]): SearchSong[] {
  return rows.flatMap((row) => {
    const variants = [parseSearchPage({ contents: [row] }, false), parseSearchPage({ contents: [row] }, true)];
    return variants.flatMap((page) => page.rows.flatMap((item) => (item.kind === "track" ? [item.track] : [])));
  });
}

function playlistRowsOf(data: unknown): unknown[] | null {
  const shelf = collect(data, "musicPlaylistShelfRenderer")[0];
  return shelf ? asArray(shelf.contents) : null;
}

function allRowsOf(data: unknown): unknown[] {
  return collect(data, "musicResponsiveListItemRenderer").map((row) => ({ musicResponsiveListItemRenderer: row }));
}

export function withThumb<T extends Track>(tracks: T[], thumb: string | null): T[] {
  return tracks.map((track) => (track.thumb === null && thumb ? { ...track, thumb } : track));
}

function creditSong(song: SearchSong, credit: Credit): SearchSong {
  return {
    ...song,
    artist: song.artist ? song.artist : credit.name,
    artistId: song.artistId ?? credit.id,
  };
}

function cardItemOf(entry: unknown, artistName: string): HomeItem | null {
  const card = at(entry, "musicTwoRowItemRenderer");
  if (!isRecord(card)) return null;
  const endpoint = at(card, "navigationEndpoint", "browseEndpoint");
  const browseId = at(endpoint, "browseId");
  const title = text(card.title).trim();
  if (typeof browseId !== "string" || !title) return null;
  const thumb = thumbOf(card.thumbnailRenderer);
  const pageType = at(
    endpoint,
    "browseEndpointContextSupportedConfigs",
    "browseEndpointContextMusicConfig",
    "pageType",
  );
  if (pageType === "MUSIC_PAGE_TYPE_ALBUM" || browseId.startsWith("MPRE")) {
    return { kind: "album", id: browseId, title, artist: artistName, thumb };
  }
  if (pageType === "MUSIC_PAGE_TYPE_ARTIST" || browseId.startsWith("UC")) {
    return { kind: "artist", id: browseId, name: title, thumb };
  }
  if (pageType === "MUSIC_PAGE_TYPE_PLAYLIST" || PLAYLIST_ID.test(browseId)) {
    return { kind: "playlist", id: browseId, title, subtitle: text(card.subtitle).trim(), thumb };
  }
  return null;
}

function shelfOf(carousel: Json, artistName: string): HomeShelf | null {
  const title = text(at(carousel, "header", "musicCarouselShelfBasicHeaderRenderer", "title")).trim();
  if (!title || VIDEO_WORD.test(title)) return null;
  const items = asArray(carousel.contents).flatMap((entry) => {
    const item = cardItemOf(entry, artistName);
    return item ? [item] : [];
  });
  return items.length > 0 ? { title, items } : null;
}

function subscriberOf(header: Json | null): string | null {
  const value =
    text(at(header, "subscriptionButton2", "subscribeButtonRenderer", "subscriberCountWithSubscribeText")) ||
    text(at(header, "subscriptionButton", "subscribeButtonRenderer", "longSubscriberCountText")) ||
    text(at(header, "subscriptionButton", "subscribeButtonRenderer", "shortSubscriberCountText"));
  return value.trim() || null;
}

function descriptionOf(data: unknown, header: Json | null): string | null {
  const shelf = collect(data, "musicDescriptionShelfRenderer")[0];
  const value = text(at(shelf, "description")).trim() || text(at(header, "description")).trim();
  return value || null;
}

function sectionsOf(data: unknown): unknown[] {
  const tab = asArray(at(data, "contents", "singleColumnBrowseResultsRenderer", "tabs")).at(0);
  return asArray(at(tab, "tabRenderer", "content", "sectionListRenderer", "contents"));
}

export function parseArtistPage(data: unknown, artistId: string): ArtistPage {
  const immersive = at(data, "header", "musicImmersiveHeaderRenderer");
  const header = headerOf(data, ARTIST_HEADERS);
  const name = text(at(header, "title")).trim();
  const credit: Credit = { id: artistId, name };

  const songs: SearchSong[] = [];
  const shelves: HomeShelf[] = [];
  for (const section of sectionsOf(data)) {
    const list = at(section, "musicShelfRenderer");
    if (isRecord(list)) songs.push(...songsOf(asArray(list.contents)));
    const carousel = at(section, "musicCarouselShelfRenderer");
    if (isRecord(carousel)) {
      const shelf = shelfOf(carousel, name);
      if (shelf) shelves.push(shelf);
    }
  }

  return {
    artist: { id: artistId, name, thumb: thumbOf(header) },
    description: descriptionOf(data, header),
    subscriberCount: subscriberOf(header),
    monthlyListeners: text(at(immersive, "monthlyListenerCount")).trim() || null,
    songs: uniqueSongs(songs).map((song) => creditSong(song, credit)),
    shelves,
  };
}

function subtitleSegmentsOf(header: Json | null): string[] {
  return segmentsOf(text(at(header, "subtitle")));
}

function artistIdInSubtitle(header: Json | null): string | null {
  const ids = asArray(at(header, "subtitle", "runs")).map((run) =>
    at(run, "navigationEndpoint", "browseEndpoint", "browseId"),
  );
  const found = ids.find((id): id is string => typeof id === "string" && id.startsWith("UC"));
  return found ?? null;
}

export function parseReleasePage(data: unknown, albumId: string): ReleasePage {
  const header = headerOf(data, PLAYLIST_HEADERS);
  const shelf = collect(data, "musicPlaylistShelfRenderer")[0];
  const tracks = uniqueSongs(songsOf(playlistRowsOf(data) ?? allRowsOf(data)));
  const kind = shelf || PLAYLIST_ID.test(albumId) ? "playlist" : header ? "album" : "other";

  const segments = subtitleSegmentsOf(header);
  const releaseSegment = segments.find((segment) => RELEASE_TYPES.has(segment.toLowerCase()));
  const releaseType = releaseSegment
    ? releaseSegment.charAt(0).toUpperCase() + releaseSegment.slice(1).toLowerCase()
    : "Album";
  const year = [...segments].reverse().find((segment) => YEAR.test(segment)) ?? null;
  const artistSegment = segments.find((segment) => segment !== releaseSegment && !YEAR.test(segment));
  const firstTrack = tracks[0];
  const thumb = thumbOf(header);
  const description = kind === "album" ? descriptionOf(data, null) : null;

  return {
    kind,
    album: {
      id: albumId,
      title: text(at(header, "title")).trim() || firstTrack?.album || "",
      artist: artistSegment ?? firstTrack?.artist ?? "",
      year,
      thumb,
      releaseType,
      description,
      artistId: artistIdInSubtitle(header) ?? firstTrack?.artistId ?? null,
    },
    tracks: withThumb(tracks, thumb),
    continuation: continuationOf(shelf) ?? continuationOf(data),
  };
}

export function parseRemotePlaylistPage(data: unknown): RemotePlaylistPage {
  const header = headerOf(data, PLAYLIST_HEADERS);
  const shelfRows = playlistRowsOf(data);
  const tracks = uniqueSongs(songsOf(shelfRows ?? allRowsOf(data)));
  const thumb = thumbOf(header);

  const lines = [text(at(header, "straplineTextOne")), text(at(header, "subtitle"))].flatMap(segmentsOf);
  const year = lines.find((segment) => YEAR.test(segment)) ?? null;
  const credit = lines.filter(
    (segment) => !YEAR.test(segment) && !["playlist", "youtube music"].includes(segment.toLowerCase()),
  );
  const curator = at(header, "facepile", "avatarStackViewModel", "text", "content");
  if (typeof curator === "string" && curator && !credit.includes(curator)) credit.unshift(curator);
  const views = segmentsOf(text(at(header, "secondSubtitle"))).find((segment) => /view/i.test(segment));
  if (views) credit.push(views);

  return {
    title: text(at(header, "title")).trim() || "Playlist",
    credit: credit.join(BULLET_JOIN),
    year,
    thumb,
    tracks: withThumb(tracks, thumb),
    continuation: continuationOf(collect(data, "musicPlaylistShelfRenderer")[0]) ?? continuationOf(data),
  };
}

export function parseShelfPage(data: unknown): ShelfPage {
  const shelf =
    collect(data, "musicPlaylistShelfContinuation")[0] ??
    collect(data, "musicShelfContinuation")[0] ??
    collect(data, "musicPlaylistShelfRenderer")[0];
  const appended = collect(data, "appendContinuationItemsAction")[0];
  const rows = shelf ? asArray(at(shelf, "contents")) : asArray(at(appended, "continuationItems"));
  return {
    songs: uniqueSongs(songsOf(rows)),
    continuation: continuationOf(shelf) ?? continuationOf(data),
  };
}

import type { Track } from "../types";
import { upgradeArtwork } from "./artwork";
import { asArray, at, collect, isRecord, parseDuration, text, type Json } from "./innertube";

export type SearchFilter = "all" | "songs" | "videos" | "albums" | "artists" | "playlists";

export const SEARCH_FILTER_PARAMS: Record<SearchFilter, string | null> = {
  all: null,
  songs: "EgWKAQIIAWoKEAkQChAFEAMQBA==",
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA==",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA==",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA==",
  playlists: "EgWKAQIoAWoKEAkQChAFEAMQBA==",
};

export type SearchSong = Track & {
  artistId: string | null;
  albumId: string | null;
  album: string | null;
  duration: number;
  explicit: boolean;
  isVideo: boolean;
};

export type BrowseType = "artist" | "album" | "playlist" | "other";

export type BrowseItem = {
  type: BrowseType;
  browseId: string;
  title: string;
  subtitle: string;
  thumb: string | null;
};

export type SearchRow =
  | { kind: "track"; track: SearchSong }
  | { kind: "top"; song: SearchSong }
  | { kind: "browse"; item: BrowseItem; top?: boolean };

export type SearchPage = { rows: SearchRow[]; continuation: string | null };

export type SuggestionRow =
  | { kind: "completion"; text: string }
  | { kind: "track"; track: SearchSong }
  | { kind: "browse"; item: BrowseItem };

export type SearchSection = { title: string | null; rows: SearchRow[] };

const SUGGEST_TEXT_MAX = 3;
const SUGGEST_RICH_MAX = 12;

const TYPE_WORDS = new Set([
  "song",
  "video",
  "album",
  "single",
  "ep",
  "artist",
  "playlist",
]);
const TALLY = /[\d.,]+\s*[KMB]?\s+(plays|views|likes|songs|tracks|subscribers|hours?|minutes?|seconds?)\b.*/i;
const DURATION = /^\d+(?::\d{2}){1,2}$/;
const SEPARATOR = " • ";
const SQUARE_MIN = 0.85;
const SQUARE_MAX = 1.15;

const BROWSE_TYPES: Record<string, BrowseType> = {
  MUSIC_PAGE_TYPE_ARTIST: "artist",
  MUSIC_PAGE_TYPE_USER_CHANNEL: "artist",
  MUSIC_PAGE_TYPE_ALBUM: "album",
  MUSIC_PAGE_TYPE_PLAYLIST: "playlist",
};

const BROWSE_SECTIONS: [string, BrowseType][] = [
  ["Artists", "artist"],
  ["Albums", "album"],
  ["Playlists", "playlist"],
  ["More", "other"],
];

function browseTypeOf(browseId: string, pageType: unknown): BrowseType {
  if (typeof pageType === "string" && BROWSE_TYPES[pageType]) return BROWSE_TYPES[pageType];
  return browseId.startsWith("UC") ? "artist" : "other";
}

function pageTypeOf(endpoint: unknown): unknown {
  return at(endpoint, "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType");
}

function columnsOf(row: Json): Json[] {
  return asArray(row.flexColumns)
    .map((column) => at(column, "musicResponsiveListItemFlexColumnRenderer"))
    .filter(isRecord);
}

function segmentsOf(textNode: unknown): string[] {
  return text(textNode)
    .split(SEPARATOR)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function thumbOf(node: unknown): { url: string | null; square: boolean } {
  const last = asArray(at(node, "thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails")).at(-1);
  const url = at(last, "url");
  const width = at(last, "width");
  const height = at(last, "height");
  const ratio = typeof width === "number" && typeof height === "number" && height > 0 ? width / height : null;
  return {
    url: typeof url === "string" ? upgradeArtwork(url) || null : null,
    square: ratio === null || (ratio >= SQUARE_MIN && ratio <= SQUARE_MAX),
  };
}

function hasValue(node: unknown, value: string): boolean {
  if (node === value) return true;
  if (Array.isArray(node)) return node.some((child) => hasValue(child, value));
  if (isRecord(node)) return Object.values(node).some((child) => hasValue(child, value));
  return false;
}

type Credit = { id: string; name: string };

function credits(columns: Json[]): { artist: Credit | null; album: Credit | null } {
  let artist: Credit | null = null;
  let album: Credit | null = null;
  for (const column of columns) {
    for (const run of asArray(at(column, "text", "runs"))) {
      const endpoint = at(run, "navigationEndpoint", "browseEndpoint");
      const id = at(endpoint, "browseId");
      if (typeof id !== "string") continue;
      const pageType = pageTypeOf(endpoint);
      const name = String(at(run, "text") ?? "");
      if (!artist && (pageType === "MUSIC_PAGE_TYPE_ARTIST" || pageType === "MUSIC_PAGE_TYPE_USER_CHANNEL")) {
        artist = { id, name };
      }
      if (!album && pageType === "MUSIC_PAGE_TYPE_ALBUM") album = { id, name };
    }
  }
  return { artist, album };
}

function browseOf(row: Json): BrowseItem | null {
  const columns = columnsOf(row);
  const title = text(columns[0]?.text).trim();
  if (!title) return null;
  const endpoint = [
    ...asArray(at(columns[0], "text", "runs")).map((run) => at(run, "navigationEndpoint", "browseEndpoint")),
    at(row, "navigationEndpoint", "browseEndpoint"),
  ].find((candidate) => typeof at(candidate, "browseId") === "string");
  const browseId = at(endpoint, "browseId");
  if (typeof browseId !== "string") return null;
  const type = browseTypeOf(browseId, pageTypeOf(endpoint));
  return {
    type,
    browseId,
    title,
    subtitle: text(columns[1]?.text).trim(),
    thumb: thumbOf(row).url,
  };
}

function trackOf(row: Json): SearchSong | null {
  const watch = collect(row, "watchEndpoint")[0];
  const videoId = at(row, "playlistItemData", "videoId") ?? at(watch, "videoId");
  if (typeof videoId !== "string") return null;
  const columns = columnsOf(row);
  const title = text(columns[0]?.text).trim();
  if (!title) return null;

  const segments = segmentsOf(columns[1]?.text);
  const fixed = asArray(row.fixedColumns).map((column) =>
    text(at(column, "musicResponsiveListItemFixedColumnRenderer", "text")).trim(),
  );
  const overlay = text(at(collect(row, "thumbnailOverlayTimeStatusRenderer")[0], "text")).trim();
  const length = text(row.lengthText).trim();
  const durationText = [segments.at(-1) ?? "", ...fixed, overlay, length].find((value) => DURATION.test(value));
  const first = segments[0]?.toLowerCase();
  const rowType = first !== undefined && TYPE_WORDS.has(first) ? first : null;
  const artistSegment = segments.find(
    (segment) => segment !== durationText && !TYPE_WORDS.has(segment.toLowerCase()) && !TALLY.test(segment),
  );
  const found = credits(columns);
  const thumb = thumbOf(row);
  const musicType = at(watch, "watchEndpointMusicSupportedConfigs", "watchEndpointMusicConfig", "musicVideoType");
  const isVideo = musicType === "MUSIC_VIDEO_TYPE_ATV" ? false
    : musicType === "MUSIC_VIDEO_TYPE_OMV" || musicType === "MUSIC_VIDEO_TYPE_UGC" ? true
    : rowType === "video" || (rowType !== "song" && !thumb.square);

  return {
    id: videoId,
    title,
    artist: artistSegment ?? found.artist?.name ?? "",
    artistId: found.artist?.id ?? null,
    album: found.album?.name ?? null,
    albumId: found.album?.id ?? null,
    thumb: thumb.url,
    duration: durationText ? parseDuration(durationText) : 0,
    explicit: hasValue(row, "MUSIC_EXPLICIT_BADGE"),
    isVideo,
  };
}

function topCardOf(card: Json): Exclude<SearchRow, { kind: "track" }> | null {
  const title = text(card.title).trim();
  if (!title) return null;
  const thumb = thumbOf(card).url;
  const videoId = at(card, "onTap", "watchEndpoint", "videoId");
  if (typeof videoId === "string") {
    const segments = segmentsOf(card.subtitle);
    const isVideo = segments[0]?.toLowerCase() === "video";
    const segmentArtist = segments.find(
      (segment) => !DURATION.test(segment) && !TYPE_WORDS.has(segment.toLowerCase()) && !TALLY.test(segment),
    );
    const durationText = segments.find((segment) => DURATION.test(segment));
    const found = credits([{ text: card.subtitle }]);
    return {
      kind: "top",
      song: {
        id: videoId,
        title,
        artist: segmentArtist ?? found.artist?.name ?? "",
        thumb,
        artistId: found.artist?.id ?? null,
        albumId: null,
        album: null,
        duration: durationText ? parseDuration(durationText) : 0,
        explicit: false,
        isVideo,
      },
    };
  }
  const browseEndpoint = at(card, "onTap", "browseEndpoint");
  const browseId = at(browseEndpoint, "browseId");
  if (typeof browseId !== "string") return null;
  const type = browseTypeOf(browseId, pageTypeOf(browseEndpoint));
  return {
    kind: "browse",
    top: true,
    item: {
      type,
      browseId,
      title,
      subtitle: text(card.subtitle).trim(),
      thumb,
    },
  };
}

export function rowKey(row: SearchRow): string {
  if (row.kind === "browse") return `b:${row.item.browseId}`;
  return `v:${row.kind === "track" ? row.track.id : row.song.id}`;
}

function continuationOf(data: unknown): string | null {
  const tokens = [
    ...collect(data, "continuationCommand").map((command) => at(command, "token")),
    ...collect(data, "nextContinuationData").map((next) => at(next, "continuation")),
  ];
  return tokens.find((token): token is string => typeof token === "string") ?? null;
}

export function parseSearchPage(data: unknown, includeVideos: boolean | "all"): SearchPage {
  const rows: SearchRow[] = [];
  const seen = new Set<string>();
  const push = (row: SearchRow) => {
    const key = rowKey(row);
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const artistShelfRows = new Map<unknown, Credit>();
  for (const card of collect(data, "musicCardShelfRenderer")) {
    const top = topCardOf(card);
    if (top?.kind === "browse" && top.item.type === "artist") {
      for (const item of collect(card, "musicResponsiveListItemRenderer")) {
        artistShelfRows.set(item, { id: top.item.browseId, name: top.item.title });
      }
    }
    if (top && includeVideos !== true && (top.kind === "browse" || includeVideos === "all" || !top.song.isVideo)) {
      push(top);
    }
  }

  for (const item of collect(data, "musicResponsiveListItemRenderer")) {
    const browse = browseOf(item);
    if (browse) {
      push({ kind: "browse", item: browse });
      continue;
    }
    let track = trackOf(item);
    const owner = artistShelfRows.get(item);
    if (track && owner && !track.artist) {
      track = { ...track, artist: owner.name, artistId: track.artistId ?? owner.id };
    }
    if (track && (includeVideos === "all" || track.isVideo === includeVideos)) push({ kind: "track", track });
  }

  return { rows, continuation: continuationOf(data) };
}

export function mergeRows(existing: SearchRow[], incoming: SearchRow[]): SearchRow[] {
  const seen = new Set(existing.map(rowKey));
  const fresh = incoming.filter((row) => {
    const key = rowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...existing, ...fresh];
}

export function foldText(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

function richKeys(row: SuggestionRow): string[] {
  if (row.kind === "completion") return [];
  if (row.kind === "browse") return [`b:${row.item.browseId}`];
  return [`v:${row.track.id}`, `t:${foldText(row.track.title)}|${foldText(row.track.artist)}`];
}

function uniqueRich(candidates: SuggestionRow[], limit: number): SuggestionRow[] {
  const seen = new Set<string>();
  const out: SuggestionRow[] = [];
  for (const row of candidates) {
    if (out.length >= limit) break;
    const keys = richKeys(row);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    out.push(row);
  }
  return out;
}

function suggestionRowOf(item: Json): SuggestionRow | null {
  const browse = browseOf(item);
  if (browse) return { kind: "browse", item: browse };
  const track = trackOf(item);
  return track ? { kind: "track", track } : null;
}

export function parseSearchSuggestions(data: unknown, query: string): SuggestionRow[] {
  const typed = query.trim();
  const completions: SuggestionRow[] = collect(data, "searchSuggestionRenderer")
    .map((renderer) => text(renderer.suggestion).trim())
    .filter((suggestion) => suggestion.length > 0 && suggestion !== typed)
    .slice(0, SUGGEST_TEXT_MAX)
    .map((suggestion) => ({ kind: "completion", text: suggestion }));
  const rich = uniqueRich(
    collect(data, "musicResponsiveListItemRenderer").flatMap((item) => {
      const row = suggestionRowOf(item);
      return row ? [row] : [];
    }),
    SUGGEST_RICH_MAX,
  );
  return [...completions, ...rich];
}

export function withSearchRows(items: SuggestionRow[], rows: SearchRow[]): SuggestionRow[] {
  const completions = items.filter((row) => row.kind === "completion");
  const rich = items.filter((row) => row.kind !== "completion");
  const fromRows: SuggestionRow[] = rows.map((row) =>
    row.kind === "browse"
      ? { kind: "browse", item: row.item }
      : { kind: "track", track: row.kind === "track" ? row.track : row.song },
  );
  return [...completions, ...uniqueRich([...rich, ...fromRows], SUGGEST_RICH_MAX)];
}

export function topResult(
  rows: SearchRow[],
  filter: SearchFilter,
): { song: SearchSong | null; browse: BrowseItem | null; rest: SearchRow[] } {
  if (filter !== "all") return { song: null, browse: null, rest: rows };
  const top = rows.find((row) => row.kind === "top");
  if (top?.kind === "top") return { song: top.song, browse: null, rest: rows.filter((row) => row !== top) };
  const card = rows.find((row) => row.kind === "browse" && row.top === true && row.item.type !== "other");
  if (card?.kind !== "browse") return { song: null, browse: null, rest: rows };
  return { song: null, browse: card.item, rest: rows.filter((row) => row !== card) };
}

export function searchSections(rows: SearchRow[], filter: SearchFilter): SearchSection[] {
  if (filter !== "all") return rows.length > 0 ? [{ title: null, rows }] : [];
  const sections: SearchSection[] = [];
  const songs = rows.filter((row) => row.kind !== "browse" && !(row.kind === "top" ? row.song : row.track).isVideo);
  const videos = rows.filter((row) => row.kind !== "browse" && (row.kind === "top" ? row.song : row.track).isVideo);
  if (songs.length > 0) sections.push({ title: "Songs", rows: songs });
  if (videos.length > 0) sections.push({ title: "Videos", rows: videos });
  for (const [title, type] of BROWSE_SECTIONS) {
    const group = rows.filter((row) => row.kind === "browse" && row.item.type === type);
    if (group.length > 0) sections.push({ title, rows: group });
  }
  return sections;
}

import { ytFetch as fetch } from "./ytFetch";
import { Innertube } from "youtubei.js";
import type { Track } from "../types";
import { getPoToken, invalidatePoToken } from "./poToken";
import { marketValue } from "./market";

export type Market = { location: string; lang: string };

export const MARKET: Market = { location: "US", lang: "en" };

export type SessionContext = {
  visitorData: string;
  poToken: string | null;
  gl: string;
  hl: string;
};

export type InnertubeSession = {
  innertube: Innertube;
  context: SessionContext;
};

let session: Promise<InnertubeSession> | null = null;

const PO_TOKEN_RETRY_MS = 60_000;
let poTokenFailedAt = 0;

async function mintPoToken(visitorData: string): Promise<string | null> {
  if (!visitorData) return null;
  if (Date.now() - poTokenFailedAt < PO_TOKEN_RETRY_MS) return null;
  try {
    return await getPoToken(visitorData);
  } catch (error) {
    poTokenFailedAt = Date.now();
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[hushio] PO token minting failed, continuing without: ${reason}`);
    return null;
  }
}

const PO_TOKEN_WAIT_MS = 1500;

async function mintPoTokenWithin(visitorData: string, waitMs: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[hushio] PO token not ready after ${waitMs} ms, continuing without`);
      resolve(null);
    }, waitMs);
  });
  try {
    return await Promise.race([mintPoToken(visitorData), late]);
  } finally {
    clearTimeout(timer);
  }
}

async function createSession({ location, lang }: Market): Promise<InnertubeSession> {
  const bootstrap = await Innertube.create({
    retrieve_player: false,
    enable_session_cache: false,
    location,
    lang,
    fetch,
  });
  const visitorData = bootstrap.session.context.client.visitorData ?? "";
  const poToken = await mintPoTokenWithin(visitorData, PO_TOKEN_WAIT_MS);
  const innertube =
    poToken === null
      ? bootstrap
      : await Innertube.create({
          retrieve_player: false,
          enable_session_cache: false,
          visitor_data: visitorData,
          po_token: poToken,
          location,
          lang,
          fetch,
        });
  console.info(`[hushio] innertube session: gl=${location} hl=${lang}`);
  return { innertube, context: { visitorData, poToken, gl: location, hl: lang } };
}

// Search does not need a playback token or a downloaded player script.
let searchSession: Promise<InnertubeSession> | null = null;
export function getSearchSession(market: Market): Promise<InnertubeSession> {
  searchSession ??= Innertube.create({
    retrieve_player: false,
    enable_session_cache: false,
    location: market.location,
    lang: market.lang,
    fetch,
  }).then((innertube) => ({
    innertube,
    context: {
      visitorData: innertube.session.context.client.visitorData ?? "",
      poToken: null,
      gl: market.location,
      hl: market.lang,
    },
  })).catch((error: unknown) => {
    searchSession = null;
    throw error;
  });
  return searchSession;
}

export function getSession(market: Market): Promise<InnertubeSession> {
  session ??= createSession(market).catch((error: unknown) => {
    session = null;
    throw error;
  });
  return session;
}

export function resetSession(market: Market): Promise<InnertubeSession> {
  session = null;
  searchSession = null;
  invalidatePoToken();
  return getSession(market);
}

export async function getSessionContext(market: Market): Promise<SessionContext> {
  return (await getSession(market)).context;
}

export type VideoType = "song" | "upload" | "episode" | "video";

export type RadioSeed = { title: string; artist: string; artistId: string | null; thumb: string | null; duration: number };

export type RadioItem = Track & {
  artistId: string | null;
  duration: number;
  explicit: boolean;
  videoType: VideoType;
};

export type RadioPage = {
  items: RadioItem[];
  seed: RadioSeed | null;
  continuation: string | null;
};

export type Json = Record<string, unknown>;

const MUSIC_VIDEO_TYPES: Record<string, VideoType> = {
  MUSIC_VIDEO_TYPE_ATV: "song",
  MUSIC_VIDEO_TYPE_UGC: "upload",
};
const DURATION = /^\d+(?::\d{2}){1,2}$/;
const BULLET = "•";

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function text(value: unknown): string {
  const simple = at(value, "simpleText");
  if (typeof simple === "string") return simple;
  return asArray(at(value, "runs"))
    .map((run) => String(at(run, "text") ?? ""))
    .join("");
}

export function collect(root: unknown, key: string): Json[] {
  const found: Json[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) return;
    for (const [name, child] of Object.entries(node)) {
      if (name === key && isRecord(child)) found.push(child);
      visit(child);
    }
  };
  visit(root);
  return found;
}

export function parseDuration(value: string): number {
  if (!DURATION.test(value)) return 0;
  return value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

function thumbnailOf(row: unknown): { url: string | null; square: boolean } {
  const last = asArray(at(row, "thumbnail", "thumbnails")).at(-1);
  const url = at(last, "url");
  const width = at(last, "width");
  const height = at(last, "height");
  return {
    url: typeof url === "string" ? url : null,
    square: typeof width !== "number" || typeof height !== "number" || width === height,
  };
}

export function radioVideoType(row: Json): VideoType {
  const musicType = at(
    row,
    "navigationEndpoint",
    "watchEndpoint",
    "watchEndpointMusicSupportedConfigs",
    "watchEndpointMusicConfig",
    "musicVideoType",
  );
  if (typeof musicType === "string") return MUSIC_VIDEO_TYPES[musicType] ?? "video";
  return thumbnailOf(row).square ? "song" : "video";
}

function bylineArtist(row: Json): { artist: string; artistId: string | null } {
  const runs = asArray(at(row, "longBylineText", "runs"));
  const bullet = runs.findIndex((run) => String(at(run, "text") ?? "").trim() === BULLET);
  const credit = bullet < 0 ? runs : runs.slice(0, bullet);
  const artist = credit.map((run) => String(at(run, "text") ?? "")).join("").trim();
  const ids = credit.map((run) => at(run, "navigationEndpoint", "browseEndpoint", "browseId"));
  const artistId = ids.find((id): id is string => typeof id === "string") ?? null;
  const credited = at(row, "credits", "artistName");
  return {
    artist: artist || (typeof credited === "string" ? credited : ""),
    artistId,
  };
}

function radioRow(row: Json): RadioItem | null {
  const videoId = at(row, "videoId") ?? at(row, "navigationEndpoint", "watchEndpoint", "videoId");
  if (typeof videoId !== "string") return null;
  const { artist, artistId } = bylineArtist(row);
  return {
    id: videoId,
    title: text(row.title),
    artist,
    artistId,
    thumb: thumbnailOf(row).url,
    duration: parseDuration(text(row.lengthText)),
    explicit: asArray(row.badges).some(
      (badge) => at(badge, "musicInlineBadgeRenderer", "icon", "iconType") === "MUSIC_EXPLICIT_BADGE",
    ),
    videoType: radioVideoType(row),
  };
}

export function parseRadioPage(data: unknown, seedId: string): RadioPage | null {
  const panel = collect(data, "playlistPanelContinuation")[0] ?? collect(data, "playlistPanelRenderer")[0];
  if (!panel) return null;

  const items: RadioItem[] = [];
  let seed: RadioSeed | null = null;
  for (const entry of asArray(panel.contents)) {
    const wrapper = at(entry, "playlistPanelVideoWrapperRenderer");
    const sides = isRecord(wrapper)
      ? [
          at(wrapper, "primaryRenderer", "playlistPanelVideoRenderer"),
          ...asArray(wrapper.counterpart).map((side) => at(side, "counterpartRenderer", "playlistPanelVideoRenderer")),
        ].filter(isRecord)
      : [at(entry, "playlistPanelVideoRenderer")].filter(isRecord);
    const side = sides.find((candidate) => radioVideoType(candidate) === "song") ?? sides[0];
    if (!side || at(side, "unplayableText")) continue;
    const row = radioRow(side);
    if (!row) continue;
    if (side.selected === true || row.id === seedId) {
      seed = { title: row.title, artist: row.artist, artistId: row.artistId, thumb: row.thumb, duration: row.duration };
      continue;
    }
    items.push(row);
  }

  const token = asArray(panel.continuations)[0];
  const continuation =
    at(token, "nextRadioContinuationData", "continuation") ?? at(token, "nextContinuationData", "continuation");
  return { items, seed, continuation: typeof continuation === "string" ? continuation : null };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(run: () => Promise<T>, attempts = 2, delayMs = 600): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt + 1 >= attempts) throw error;
      await sleep(delayMs * (attempt + 1));
    }
  }
}

export async function getRadio(videoId: string, token?: string): Promise<RadioPage | null> {
  const { innertube } = await getSession(marketValue());
  const body = {
    videoId,
    playlistId: `RDAMVM${videoId}`,
    enablePersistentPlaylistPanel: true,
    tunerSettingValue: "AUTOMIX_SETTING_NORMAL",
    watchEndpointMusicSupportedConfigs: {
      watchEndpointMusicConfig: { hasPersistentPlaylistPanel: true, musicVideoType: "MUSIC_VIDEO_TYPE_ATV" },
    },
    ...(token === undefined ? {} : { continuation: token }),
    client: "YTMUSIC",
  };
  const response = await withRetry(() => innertube.actions.execute("/next", body));
  return parseRadioPage(response.data, videoId);
}

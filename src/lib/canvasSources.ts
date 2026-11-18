import { fetch as pluginFetch } from "@tauri-apps/plugin-http";
import { canvasClipFor, canvasMissFor, rememberCanvasClip, rememberCanvasMiss, type CanvasClip } from "./canvas";

type CanvasSourceId = "apple" | "tidal" | "community";

export type CanvasQuery = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  durationSeconds?: number | null;
};

type HttpResponse = { ok: boolean; status: number; text: () => Promise<string> };
export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>;

export type CanvasLookupOptions = {
  canPlayHls: boolean;
  http?: HttpGet;
  now?: () => number;
  region?: string;
};

type LookupContext = { http: HttpGet; now: () => number; region: string };

const REQUEST_TIMEOUT_MS = 6000;
const SOURCE_TIMEOUT_MS = 15000;
const DURATION_TOLERANCE_S = 3;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const APPLE_WEB_PLAYER = "https://music.apple.com/us/browse";
const APPLE_CATALOG = "https://amp-api.music.apple.com/v1/catalog";
const APPLE_MIN_SCORE = 12;
const APPLE_TOKEN_RETRY_MS = 30 * 60 * 1000;
const APPLE_ALBUM_LOOKUPS = 3;
const APPLE_EDITION_WORDS = ["deluxe", "expanded", "remastered", "remix", "version", "edit", "mix", "bonus"];
const APPLE_COMPILATION_MARKERS = [
  "playlist",
  "set list",
  "essentials",
  "dj mix",
  "mixed",
  "apple music",
  "today's hits",
  "session",
];

const TIDAL_SEARCH = "https://api.tidal.com/v1/search";
const TIDAL_EMBED_TOKEN = "vNVdglQOjFJJGG2U";

const COMMUNITY_MANIFEST = "https://vivimusicanvas.mkmdevilmi.workers.dev/canvas.json";
const COMMUNITY_TTL_MS = 30 * 60 * 1000;

export function cleanTitle(title: string): string {
  const head = title.split(" | ")[0] ?? title;
  const stripped = head
    .replace(/\s*[([][^)\]]*(?:official|lyric|lyrical|video|audio|visualizer|from\b)[^)\]]*[)\]]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || title.trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function splitArtists(value: string): string[] {
  return value
    .split(/,|&|;|\bfeat\.?\b|\bft\.?\b|\band\b|\bwith\b/i)
    .map(normalizeText)
    .filter((part) => part.length > 0);
}

export function durationAgrees(wanted: number | null | undefined, got: number | null | undefined): boolean {
  if (!wanted || !got) return true;
  return Math.abs(wanted - got) <= DURATION_TOLERANCE_S;
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:$|\?)/i.test(url);
}

export function playableUrl(url: string, canPlayHls: boolean): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  return canPlayHls || !isHlsUrl(url);
}

export function canPlayHlsNatively(): boolean {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video");
  return video.canPlayType("application/vnd.apple.mpegurl") !== "" || video.canPlayType("application/x-mpegURL") !== "";
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function regionFromLocale(language: string | undefined): string {
  const match = language?.match(/-([A-Za-z]{2})\b/);
  return match ? match[1].toUpperCase() : "US";
}

type AppleVideoAsset = { video?: string; videoUrl?: string; hlsUrl?: string; url?: string };
type AppleVideo = Record<string, AppleVideoAsset | undefined>;
export type AppleHit = {
  id?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    url?: string;
    durationInMillis?: number;
    editorialVideo?: AppleVideo;
  };
  relationships?: { albums?: { data?: { id?: string }[] } };
};

function isCompilation(name: string): boolean {
  const lower = name.toLowerCase();
  return APPLE_COMPILATION_MARKERS.some((marker) => lower.includes(marker));
}

function videoLink(video: AppleVideo, key: string): string | null {
  const asset = video[key];
  if (!asset) return null;
  return asset.video || asset.videoUrl || asset.hlsUrl || asset.url || null;
}

export function appleMotionUrls(video: AppleVideo | undefined): string[] {
  if (!video) return [];
  const square = videoLink(video, "motionDetailSquare") ?? videoLink(video, "motionSquareVideo1x1");
  const raw = videoLink(video, "motionDetailRaw");
  const tall = videoLink(video, "motionDetailTall") ?? videoLink(video, "motionTallVideo3x4");
  return [...new Set([square, raw, tall].filter((url): url is string => Boolean(url)))];
}

function scoreAppleHit(hit: AppleHit, query: CanvasQuery, albumIsSelf = false): number | null {
  const attributes = hit.attributes;
  if (!attributes) return null;
  const hitName = attributes.name ?? "";
  const hitAlbum = albumIsSelf ? hitName : (attributes.albumName ?? "");
  if (isCompilation(hitName) || isCompilation(hitAlbum)) return null;

  const wanted = splitArtists(query.artist);
  const credited = splitArtists(attributes.artistName ?? "");
  if (wanted.length === 0 || credited.length === 0) return null;
  if (!wanted.every((name) => credited.includes(name))) return null;

  const hitSeconds = attributes.durationInMillis ? attributes.durationInMillis / 1000 : null;
  if (!durationAgrees(query.durationSeconds, hitSeconds)) return null;

  const wantTitle = normalizeText(cleanTitle(query.title));
  const hitTitle = normalizeText(hitName);
  if (!wantTitle) return null;

  let score = 10;
  if (hitTitle === wantTitle) score += 15;
  else if (hitTitle && (hitTitle.includes(wantTitle) || wantTitle.includes(hitTitle))) score += 7;
  else score -= 10;

  if (query.album && hitAlbum) {
    const wantAlbum = normalizeText(query.album);
    const gotAlbum = normalizeText(hitAlbum);
    if (gotAlbum === wantAlbum) score += 20;
    else if (gotAlbum && wantAlbum && (gotAlbum.includes(wantAlbum) || wantAlbum.includes(gotAlbum))) score += 10;
  }

  const rawTitle = query.title.toLowerCase();
  for (const word of APPLE_EDITION_WORDS) {
    const inWanted = rawTitle.includes(word);
    const inHit = hitName.toLowerCase().includes(word);
    if (inWanted && inHit) score += 5;
    else if (inHit) score -= 3;
  }
  return score;
}

export function rankAppleHits(hits: AppleHit[], query: CanvasQuery, albumIsSelf = false): AppleHit[] {
  return hits
    .map((hit) => ({ hit, score: scoreAppleHit(hit, query, albumIsSelf) }))
    .filter((entry): entry is { hit: AppleHit; score: number } => entry.score !== null && entry.score >= APPLE_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.hit);
}

export function appleAlbumId(hit: AppleHit): string | null {
  const fromRelationship = hit.relationships?.albums?.data?.[0]?.id;
  if (fromRelationship) return fromRelationship.startsWith("pl.") ? null : fromRelationship;
  const url = hit.attributes?.url ?? "";
  if (!url.includes("/album/")) return null;
  const id = (url.split("/album/")[1] ?? "").split("?")[0].split("/").pop() ?? "";
  return /^\d+$/.test(id) ? id : null;
}

function appleSearchTerm(query: CanvasQuery): string {
  const title = cleanTitle(query.title);
  let term = query.title.toLowerCase().includes(query.artist.toLowerCase()) ? "" : `${query.artist} `;
  term += title;
  if (query.album && !title.toLowerCase().includes(query.album.toLowerCase())) term += ` ${query.album}`;
  return term.trim();
}

function jwtPart(part: string | undefined): Record<string, unknown> | null {
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function jwtExpiryMs(token: string): number | null {
  const exp = jwtPart(token.split(".")[1])?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

function isWebPlayerToken(token: string): boolean {
  const [header, payload] = token.split(".");
  const headerJson = JSON.stringify(jwtPart(header) ?? {});
  const payloadJson = JSON.stringify(jwtPart(payload) ?? {});
  return headerJson.includes("WebPlayKid") || payloadJson.includes("AMPWebPlay");
}

export function appleBundlePaths(html: string): string[] {
  return [...new Set(html.match(/\/assets\/index(?:-legacy)?[~-][A-Za-z0-9_-]+\.js/g) ?? [])];
}

export function pickAppleToken(
  script: string,
  nowMs: number,
  rejected: ReadonlySet<string> = new Set(),
): { token: string; expiresAtMs: number } | null {
  const candidates = [...new Set(script.match(/ey[A-Za-z0-9_-]+\.ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [])]
    .filter((token) => !rejected.has(token))
    .map((token) => ({ token, expiresAtMs: jwtExpiryMs(token) }))
    .filter((entry): entry is { token: string; expiresAtMs: number } => entry.expiresAtMs !== null && entry.expiresAtMs > nowMs);
  return candidates.find((entry) => isWebPlayerToken(entry.token)) ?? candidates[0] ?? null;
}

type TidalTrack = {
  title?: string;
  duration?: number;
  artists?: { name?: string }[];
  album?: { videoCover?: string | null };
};

export function tidalCoverUrl(id: string): string | null {
  const parts = id.split("-");
  if (parts.length !== 5 || parts.some((part) => part.length === 0)) return null;
  return `https://resources.tidal.com/videos/${parts.join("/")}/1280x1280.mp4`;
}

export function pickTidalVideo(root: { tracks?: { items?: TidalTrack[] } } | null, query: CanvasQuery): string | null {
  const wantTitle = normalizeText(cleanTitle(query.title));
  const wantArtists = splitArtists(query.artist);
  for (const track of root?.tracks?.items ?? []) {
    if (!track.title || !track.album?.videoCover) continue;
    if (normalizeText(cleanTitle(track.title)) !== wantTitle) continue;
    const credited = (track.artists ?? []).map((artist) => normalizeText(artist.name ?? "")).filter(Boolean);
    if (wantArtists.length === 0 || !wantArtists.every((name) => credited.includes(name))) continue;
    if (!durationAgrees(query.durationSeconds, track.duration)) continue;
    const url = tidalCoverUrl(track.album.videoCover);
    if (url) return url;
  }
  return null;
}

export type CommunityEntry = { song: string; artist: string; album: string; url: string };

export function parseCommunityManifest(root: { items?: Record<string, unknown>[] } | null): CommunityEntry[] {
  const entries: CommunityEntry[] = [];
  for (const item of root?.items ?? []) {
    const { song, artist, url } = item;
    if (typeof song !== "string" || typeof artist !== "string" || typeof url !== "string") continue;
    const album = typeof item.album === "string" ? item.album : "";
    entries.push({ song, artist, album, url });
  }
  return entries;
}

export function matchCommunity(entries: CommunityEntry[], query: CanvasQuery): string | null {
  const wantTitle = normalizeText(cleanTitle(query.title));
  const wantArtist = normalizeText(query.artist);
  const wantAlbum = normalizeText(query.album ?? "");
  const hit = entries.find((entry) => {
    const song = normalizeText(entry.song);
    const credited = normalizeText(entry.artist);
    const listed = normalizeText(entry.album);
    const titleOk = song.length > 0 && (wantTitle.includes(song) || song.includes(wantTitle));
    const artistOk = credited.length > 0 && (wantArtist.includes(credited) || credited.includes(wantArtist));
    const albumOk = listed === "" || wantAlbum === "" || listed === wantAlbum;
    return titleOk && artistOk && albumOk;
  });
  return hit && playableUrl(hit.url, true) ? hit.url : null;
}

const defaultHttp: HttpGet = async (url, headers = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await pluginFetch(url, { headers, signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      text: async () => {
        try {
          return await response.text();
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
};

async function getText(ctx: LookupContext, url: string, headers?: Record<string, string>): Promise<string | null> {
  const response = await ctx.http(url, headers);
  return response.ok ? response.text() : null;
}

let appleToken: { token: string; expiresAtMs: number } | null = null;
let appleRetryAt = 0;
const appleRejected = new Set<string>();

async function currentAppleToken(ctx: LookupContext): Promise<string | null> {
  const now = ctx.now();
  if (appleToken && now < appleToken.expiresAtMs - 60_000) return appleToken.token;
  if (now < appleRetryAt) return null;
  const html = await getText(ctx, APPLE_WEB_PLAYER, { "User-Agent": BROWSER_UA });
  for (const path of appleBundlePaths(html ?? "")) {
    const script = await getText(ctx, `https://music.apple.com${path}`, { "User-Agent": BROWSER_UA });
    const found = script ? pickAppleToken(script, now, appleRejected) : null;
    if (found) {
      appleToken = found;
      return found.token;
    }
  }
  appleRetryAt = now + APPLE_TOKEN_RETRY_MS;
  return null;
}

function appleHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Origin: "https://music.apple.com",
    Referer: "https://music.apple.com/",
    "User-Agent": BROWSER_UA,
  };
}

async function appleGet(ctx: LookupContext, url: string, token: string): Promise<string | null> {
  const response = await ctx.http(url, appleHeaders(token));
  if (response.status === 401) {
    appleRejected.add(token);
    if (appleToken?.token === token) appleToken = null;
    return null;
  }
  return response.ok ? response.text() : null;
}

type AppleSearch = { results?: { songs?: { data?: AppleHit[] } } };
type AppleAlbum = { data?: { attributes?: { name?: string; editorialVideo?: AppleVideo } }[] };

async function findApple(query: CanvasQuery, ctx: LookupContext): Promise<string[] | null> {
  const token = await currentAppleToken(ctx);
  if (!token) return null;
  const storefront = ctx.region.toLowerCase();
  const params = new URLSearchParams({
    term: appleSearchTerm(query),
    types: "songs",
    limit: "10",
    extend: "editorialVideo",
    include: "albums",
  });
  const root = parseJson<AppleSearch>(await appleGet(ctx, `${APPLE_CATALOG}/${storefront}/search?${params}`, token));
  let albumLookups = 0;
  for (const hit of rankAppleHits(root?.results?.songs?.data ?? [], query)) {
    const inline = appleMotionUrls(hit.attributes?.editorialVideo);
    if (inline.length > 0) return inline;
    const albumId = appleAlbumId(hit);
    if (!albumId || albumLookups >= APPLE_ALBUM_LOOKUPS) continue;
    albumLookups++;
    const album = parseJson<AppleAlbum>(
      await appleGet(ctx, `${APPLE_CATALOG}/${storefront}/albums/${albumId}?extend=editorialVideo`, token),
    );
    const record = album?.data?.[0]?.attributes;
    if (!record || isCompilation(record.name ?? "")) continue;
    const urls = appleMotionUrls(record.editorialVideo);
    if (urls.length > 0) return urls;
  }
  return null;
}

type TidalSearch = { tracks?: { items?: TidalTrack[] } };

async function findTidal(query: CanvasQuery, ctx: LookupContext): Promise<string[] | null> {
  const title = cleanTitle(query.title);
  const text = query.album ? `${query.album} ${query.artist} ${title}` : `${query.artist} ${title}`;
  const params = new URLSearchParams({
    query: text,
    limit: "10",
    types: "TRACKS",
    countryCode: ctx.region,
  });
  const body = await getText(ctx, `${TIDAL_SEARCH}?${params}`, {
    "X-Tidal-Token": TIDAL_EMBED_TOKEN,
    "User-Agent": BROWSER_UA,
  });
  const url = pickTidalVideo(parseJson<TidalSearch>(body), query);
  return url ? [url] : null;
}

let communityIndex: { entries: CommunityEntry[]; fetchedAt: number } | null = null;

async function communityEntries(ctx: LookupContext): Promise<CommunityEntry[]> {
  const now = ctx.now();
  if (communityIndex && now - communityIndex.fetchedAt < COMMUNITY_TTL_MS) return communityIndex.entries;
  const body = await getText(ctx, COMMUNITY_MANIFEST, { "User-Agent": BROWSER_UA });
  const parsed = parseCommunityManifest(parseJson(body));
  const entries = parsed.length > 0 ? parsed : (communityIndex?.entries ?? []);
  communityIndex = { entries, fetchedAt: now };
  return entries;
}

async function findCommunity(query: CanvasQuery, ctx: LookupContext): Promise<string[] | null> {
  const url = matchCommunity(await communityEntries(ctx), query);
  return url ? [url] : null;
}

const SOURCES: { id: CanvasSourceId; find: (query: CanvasQuery, ctx: LookupContext) => Promise<string[] | null> }[] = [
  { id: "apple", find: findApple },
  { id: "tidal", find: findTidal },
  { id: "community", find: findCommunity },
];

function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([work.catch(() => fallback), limit]).finally(() => clearTimeout(timer));
}

export async function findCanvasClip(query: CanvasQuery, options: CanvasLookupOptions): Promise<CanvasClip | null> {
  const ctx: LookupContext = {
    http: options.http ?? defaultHttp,
    now: options.now ?? Date.now,
    region: options.region ?? regionFromLocale(typeof navigator === "undefined" ? undefined : navigator.language),
  };
  for (const source of SOURCES) {
    const urls = await withTimeout(source.find(query, ctx), SOURCE_TIMEOUT_MS, null);
    const url = urls?.find((candidate) => playableUrl(candidate, options.canPlayHls));
    if (url) return { url };
  }
  return null;
}

const inflight = new Map<string, Promise<CanvasClip | null>>();

export function lookupCanvasClip(query: CanvasQuery, options: CanvasLookupOptions): Promise<CanvasClip | null> {
  const known = canvasClipFor(query.id);
  if (known) return Promise.resolve(known);
  if (canvasMissFor(query.id)) return Promise.resolve(null);
  const pending = inflight.get(query.id);
  if (pending) return pending;
  const job = findCanvasClip(query, options).then((found) => {
    inflight.delete(query.id);
    if (found) rememberCanvasClip(query.id, found);
    else rememberCanvasMiss(query.id);
    return found;
  });
  inflight.set(query.id, job);
  return job;
}

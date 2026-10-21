import { ytFetch as fetch } from "./ytFetch";
import type { Innertube } from "youtubei.js";
import { getSession, resetSession, type Market } from "./innertube";

type InnerTubeClient = NonNullable<NonNullable<Parameters<Innertube["getBasicInfo"]>[1]>["client"]>;

const MARKET: Market = { location: "US", lang: "en" };
const MEDIA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CLIENTS: readonly InnerTubeClient[] = ["VISIONOS", "IOS", "ANDROID_VR", "WEB", "YTMUSIC", "ANDROID", "TV"];
const PIPED_BASES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
];
const PROBE_TIMEOUT_MS = 10_000;
const PIPED_TIMEOUT_MS = 12_000;
const CACHE_LIMIT = 500;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_TTL_MS = 6 * 60 * 60 * 1000;
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const EXPIRE_PARAM = /[?&/]expire[=/](\d{9,11})/;
const AUDIO_RANK: Record<number, number> = { 141: 6, 251: 5, 140: 4, 250: 3, 249: 2, 139: 1 };

export type ResolvedStream = {
  url: string;
  mime: string;
  lufs: number | null;
  itag?: number;
  clen?: number;
};

type Pin = { itag: number; clen?: number };

type AudioFormat = {
  itag: number;
  url?: string;
  mime_type?: string;
  bitrate?: number;
  average_bitrate?: number;
  content_length?: number;
  has_audio: boolean;
  has_video: boolean;
  is_drc?: boolean;
  is_original?: boolean;
  loudness_db?: number;
  track_absolute_loudness_lkfs?: number;
  signature_cipher?: string;
  cipher?: string;
  decipher?(player?: unknown): Promise<string>;
};

export type StreamingData = {
  url?: string;
  mime_type?: string;
  hls_manifest_url?: string;
  formats: AudioFormat[];
  adaptive_formats: AudioFormat[];
};

type ResolveOptions = { maxKbps?: number; mp4Only: boolean; pin?: Pin };

type CacheEntry = { value: ResolvedStream; expiresAt: number };

type PipedStream = { url?: string; mimeType?: string; bitrate?: number };

const resolveCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ResolvedStream>>();
let preferredClientIdx = 0;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: number | undefined): number | undefined {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

function audioScore(format: AudioFormat): number {
  return (AUDIO_RANK[format.itag] ?? 0) * 1e9 + (format.bitrate ?? 0);
}

function kbps(format: AudioFormat): number {
  return (format.average_bitrate ?? format.bitrate ?? 0) / 1000;
}

function formatLufs(format: AudioFormat): number | null {
  if (isFiniteNumber(format.track_absolute_loudness_lkfs)) return format.track_absolute_loudness_lkfs;
  if (isFiniteNumber(format.loudness_db)) return format.loudness_db - 14;
  return null;
}

async function formatUrl(format: AudioFormat, player: unknown): Promise<string | null> {
  try {
    if (typeof format.url === "string") return format.url;
    if (typeof format.decipher === "function" && player) {
      const deciphered = await format.decipher(player);
      if (deciphered) return deciphered;
    }
    return null;
  } catch (error) {
    console.warn(`[hushio] stream deciphering failed: ${describeError(error)}`);
    return null;
  }
}

export function streamTtlMs(url: string, now: number): number {
  const expire = EXPIRE_PARAM.exec(url)?.[1];
  if (expire === undefined) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(0, Number(expire) * 1000 - now - EXPIRY_MARGIN_MS));
}

export async function pickAudio(
  streaming: StreamingData | undefined,
  player: unknown,
  maxKbps: number | undefined,
  mp4Only: boolean,
  pin?: Pin,
): Promise<ResolvedStream | null> {
  if (!streaming) return null;

  const isAudioOnly = (format: AudioFormat) => format.has_audio && !format.has_video;
  let candidates = streaming.adaptive_formats.filter(isAudioOnly);
  if (candidates.length === 0) candidates = streaming.formats.filter(isAudioOnly);
  if (candidates.length === 0) {
    return typeof streaming.url === "string"
      ? { url: streaming.url, mime: streaming.mime_type ?? "audio/mp4", lufs: null }
      : null;
  }

  const plain = candidates.filter((format) => !format.is_drc && format.is_original !== false);
  if (plain.length > 0) candidates = plain;
  candidates = [...candidates].sort((a, b) => audioScore(b) - audioScore(a));

  if (pin) {
    candidates = candidates.filter(
      (format) =>
        format.itag === pin.itag &&
        (pin.clen == null || format.content_length == null || format.content_length === pin.clen),
    );
  } else {
    if (maxKbps) {
      const ceiling = maxKbps * 1.1;
      const within = candidates.filter((format) => kbps(format) <= ceiling);
      if (within.length > 0) candidates = within;
    }
    if (mp4Only) {
      const mp4 = candidates.filter((format) => format.mime_type?.includes("mp4"));
      if (mp4.length > 0) candidates = mp4;
    }
  }

  const preferred = candidates[0];
  if (!preferred) return null;
  const url = await formatUrl(preferred, player);
  if (!url) return null;
  return {
    url,
    mime: preferred.mime_type ?? "audio/mp4",
    lufs: formatLufs(preferred),
    itag: positive(preferred.itag),
    clen: positive(preferred.content_length),
  };
}

export async function probeUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": MEDIA_USER_AGENT, Range: "bytes=0-" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.status !== 206 && response.status !== 200) {
      await response.body?.cancel();
      return false;
    }
    const reader = response.body?.getReader();
    if (!reader) return false;
    const { value } = await reader.read();
    await reader.cancel();
    return (value?.byteLength ?? 0) > 0;
  } catch {
    return false;
  }
}

function hasUrl(stream: PipedStream): stream is PipedStream & { url: string } {
  return typeof stream.url === "string";
}

export async function resolveViaPiped(videoId: string): Promise<ResolvedStream> {
  if (!/^[\w-]{6,20}$/.test(videoId)) throw new Error("Invalid video id");
  for (const base of PIPED_BASES) {
    try {
      const response = await fetch(`${base}/streams/${videoId}`, {
        headers: { "User-Agent": MEDIA_USER_AGENT },
        signal: AbortSignal.timeout(PIPED_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const data: { audioStreams?: PipedStream[] } = await response.json();
      const streams = (data.audioStreams ?? [])
        .filter(hasUrl)
        .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const pick = streams.find((stream) => /mp4|aac/i.test(stream.mimeType ?? "")) ?? streams[0];
      if (pick && (await probeUrl(pick.url))) return { url: pick.url, mime: "audio/mp4", lufs: null };
    } catch (error) {
      console.warn(`[hushio] Piped mirror ${base} failed: ${describeError(error)}`);
    }
  }
  throw new Error("No Piped mirror had a playable stream");
}

function describeStreams(status: string | undefined, streaming: StreamingData | undefined): string {
  const audio = (streaming?.adaptive_formats ?? []).filter((format) => format.has_audio && !format.has_video);
  const plainUrl = audio.filter((format) => typeof format.url === "string").length;
  const sig = audio.filter((format) => format.signature_cipher || format.cipher).length;
  const hls = streaming?.hls_manifest_url ? "y" : "n";
  return `playability=${status ?? "?"} audio=${audio.length} plainUrl=${plainUrl} sig=${sig} hls=${hls}`;
}

async function resolveWithClient(
  innertube: Innertube,
  poToken: string | null,
  client: InnerTubeClient,
  videoId: string,
  options: ResolveOptions,
): Promise<ResolvedStream> {
  const info = await innertube.getBasicInfo(videoId, { client, po_token: poToken ?? undefined });
  console.info(`[hushio] stream ${client}: ${describeStreams(info.playability_status?.status, info.streaming_data)}`);
  const picked = await pickAudio(
    info.streaming_data,
    innertube.session.player,
    options.maxKbps,
    options.mp4Only,
    options.pin,
  );
  if (!picked) throw new Error(`no audio format for client ${client}`);
  if (!(await probeUrl(picked.url))) throw new Error(`stream rejected for client ${client}`);
  return picked;
}

async function resolveUncached(videoId: string, options: ResolveOptions): Promise<ResolvedStream> {
  let lastError: unknown;
  for (let round = 0; round < 2; round++) {
    if (round === 1) {
      console.warn(
        `[hushio] all clients failed, rebuilding session with a fresh PO token: ${describeError(lastError)}`,
      );
      await resetSession(MARKET);
    }
    const { innertube, context } = await getSession(MARKET);
    for (let i = 0; i < CLIENTS.length; i++) {
      const idx = (preferredClientIdx + i) % CLIENTS.length;
      try {
        const resolved = await resolveWithClient(innertube, context.poToken, CLIENTS[idx], videoId, options);
        preferredClientIdx = idx;
        return resolved;
      } catch (error) {
        lastError = error;
      }
    }
  }
  try {
    return await resolveViaPiped(videoId);
  } catch (pipedError) {
    console.warn(`[hushio] Piped fallback failed: ${describeError(pipedError)}`);
    throw lastError instanceof Error ? lastError : new Error("Could not resolve a playable audio stream");
  }
}

function cacheKey(videoId: string, maxKbps: number | undefined, mp4Only: boolean): string {
  return `${videoId}|${maxKbps ?? ""}|${mp4Only ? "mp4" : ""}`;
}

function evictOldest(): void {
  for (const key of resolveCache.keys()) {
    if (resolveCache.size <= CACHE_LIMIT) return;
    resolveCache.delete(key);
  }
}

export function resolveStream(
  videoId: string,
  refresh = false,
  maxKbps?: number,
  mp4Only = false,
): Promise<ResolvedStream> {
  const key = cacheKey(videoId, maxKbps, mp4Only);
  const cached = resolveCache.get(key);
  if (!refresh && cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.value);
  const shared = inFlight.get(key);
  if (!refresh && shared) return shared;

  const previous = cached?.value;
  const pin = previous?.itag !== undefined ? { itag: previous.itag, clen: previous.clen } : undefined;
  const attempt: Promise<ResolvedStream> = resolveUncached(videoId, { maxKbps, mp4Only, pin })
    .then((value) => {
      const ts = Date.now();
      resolveCache.delete(key);
      resolveCache.set(key, { value, expiresAt: ts + streamTtlMs(value.url, ts) });
      evictOldest();
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === attempt) inFlight.delete(key);
    });
  inFlight.set(key, attempt);
  return attempt;
}

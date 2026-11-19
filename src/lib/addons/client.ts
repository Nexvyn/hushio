import { fetch } from "@tauri-apps/plugin-http";
import { validateManifest } from "./registry";
import {
  ADDON_QUALITY_KEY,
  ADDON_TEST_QUERY,
  AddonError,
  LOSSLESS,
  type AddonHealth,
  type AddonManifest,
  type AddonSource,
  type AddonStream,
  type AddonTrack,
} from "./types";

type AddonRef = Pick<AddonSource, "baseUrl" | "manifest">;

const TIMEOUT_MS = 6_000;
const MANIFEST_MAX_BYTES = 64 * 1024;
const SEARCH_MAX_BYTES = 512 * 1024;
const STREAM_MAX_BYTES = 16 * 1024;
const SEARCH_RESULTS_MAX = 200;
const STREAM_URL_MAX = 2048;
const TRACK_ID_MAX = 256;
const FORMAT_MAX = 16;
const MIME_BY_FORMAT: Record<string, string> = {
  flac: "audio/flac",
  alac: 'audio/mp4; codecs="alac"',
  wav: "audio/wav",
  aiff: "audio/aiff",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  ogg: "audio/ogg",
  opus: 'audio/ogg; codecs="opus"',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong";
}

async function getJson(url: string, maxBytes: number, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 404) throw new AddonError("No add-on answers at that address");
    if (!response.ok) throw new AddonError(`The add-on answered with status ${response.status}`);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw new AddonError("The add-on sent too much data");
    const text = await response.text();
    if (text.length > maxBytes) throw new AddonError("The add-on sent too much data");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AddonError("The add-on did not send JSON");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new AddonError("The add-on took too long to answer");
    if (error instanceof AddonError) throw error;
    throw new AddonError("Could not reach the add-on");
  } finally {
    clearTimeout(timer);
  }
}

export function qualityFor(manifest: AddonManifest): string {
  const options = manifest.settings.find((setting) => setting.key === ADDON_QUALITY_KEY)?.options ?? [];
  if (options.length === 0) return LOSSLESS;
  return options.includes(LOSSLESS) ? LOSSLESS : options[0];
}

export async function fetchManifest(baseUrl: string): Promise<AddonManifest> {
  return validateManifest(await getJson(`${baseUrl}/manifest.json`, MANIFEST_MAX_BYTES));
}

function trackOf(entry: unknown): AddonTrack | null {
  if (!isRecord(entry)) return null;
  const id = textOf(entry.id, TRACK_ID_MAX);
  const title = textOf(entry.title, 200);
  if (!id || !title) return null;
  const duration = typeof entry.duration === "number" && Number.isFinite(entry.duration) && entry.duration > 0
    ? entry.duration
    : null;
  return {
    id,
    title,
    artist: textOf(entry.artist, 200),
    durationSec: duration,
    format: textOf(entry.format, FORMAT_MAX).toLowerCase(),
  };
}

export async function searchAddon(source: AddonRef, query: string, timeoutMs = TIMEOUT_MS): Promise<AddonTrack[]> {
  const url = `${source.baseUrl}/search?q=${encodeURIComponent(query)}&quality=${encodeURIComponent(qualityFor(source.manifest))}`;
  const body = await getJson(url, SEARCH_MAX_BYTES, timeoutMs);
  if (!isRecord(body) || !Array.isArray(body.tracks)) {
    throw new AddonError("The add-on's search answer had no tracks list");
  }
  const tracks: AddonTrack[] = [];
  for (const entry of body.tracks.slice(0, SEARCH_RESULTS_MAX)) {
    const track = trackOf(entry);
    if (track) tracks.push(track);
  }
  return tracks;
}

function streamUrlOf(value: unknown): string {
  if (typeof value !== "string" || value.length > STREAM_URL_MAX) {
    throw new AddonError("The add-on sent a stream address Hushio can't use");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AddonError("The add-on sent a stream address Hushio can't use");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AddonError("The add-on sent a stream address Hushio can't use");
  }
  return url.href;
}

function streamOf(body: unknown): AddonStream {
  if (!isRecord(body)) throw new AddonError("The add-on's stream answer is not valid");
  const reported = textOf(body.error, 120);
  if (reported) throw new AddonError(reported);
  const manifestKind = textOf(body.manifest, 16).toLowerCase();
  if (manifestKind !== "" && manifestKind !== "none") {
    throw new AddonError("The add-on sent a stream Hushio can't play (HLS or DASH)");
  }
  if (body.encrypted !== undefined && body.encrypted !== null && body.encrypted !== false) {
    throw new AddonError("The add-on's stream is encrypted");
  }
  const format = (textOf(body.format, FORMAT_MAX) || textOf(body.codec, FORMAT_MAX)).toLowerCase();
  const mime = MIME_BY_FORMAT[format];
  if (!mime) throw new AddonError("The add-on sent an audio format Hushio can't play");
  return { url: streamUrlOf(body.url), format, mime };
}

export async function streamAddon(source: AddonRef, trackId: string, timeoutMs = TIMEOUT_MS): Promise<AddonStream> {
  const url = `${source.baseUrl}/stream/${encodeURIComponent(trackId)}?quality=${encodeURIComponent(qualityFor(source.manifest))}`;
  return streamOf(await getJson(url, STREAM_MAX_BYTES, timeoutMs));
}

export async function testAddon(source: AddonRef): Promise<AddonHealth> {
  const started = Date.now();
  try {
    await searchAddon(source, ADDON_TEST_QUERY);
    return { ok: true, latencyMs: Date.now() - started, checkedAt: Date.now(), error: null };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, checkedAt: Date.now(), error: messageOf(error) };
  }
}

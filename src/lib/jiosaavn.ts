import { fetch } from "@tauri-apps/plugin-http";
import { useSettings } from "../stores/settings";
import { decryptDesEcbBase64 } from "./des";
import type { ResolvedStream } from "./resolveStream";
import type { SearchSong } from "./searchParse";

const API_URL = "https://www.jiosaavn.com/api.php";
const ID_PREFIX = "jiosaavn:";
const MEDIA_KEY = "38346591";
const TIMEOUT_MS = 8_000;
const RENDITION = /_(48|96|160|320)\.(mp4|aac|mp3)(?=[?#]|$)/i;
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&#039;": "'",
  "&#39;": "'",
  "&#x27;": "'",
};

type RawSong = {
  id?: string;
  title?: string;
  image?: string;
  explicit_content?: string;
  more_info?: {
    album?: string;
    album_id?: string;
    duration?: string;
    encrypted_media_url?: string;
    "320kbps"?: string;
    artistMap?: { primary_artists?: { name?: string }[] };
  };
};

export function isJioSaavnId(id: string): boolean {
  return id.startsWith(ID_PREFIX);
}

function saavnIdOf(id: string): string {
  return id.slice(ID_PREFIX.length);
}

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|quot|lt|gt|#039|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity);
}

function thumbOf(image: string | undefined): string | null {
  if (!image) return null;
  return image.replace(/150x150|50x50/, "500x500").replace(/^http:\/\//, "https://");
}

export function mapJioSaavnSong(raw: RawSong): SearchSong | null {
  if (!raw.id || !raw.title) return null;
  const info = raw.more_info;
  const artists = (info?.artistMap?.primary_artists ?? [])
    .map((artist) => artist.name ?? "")
    .filter((name) => name !== "")
    .join(", ");
  const seconds = Number(info?.duration);
  return {
    id: `${ID_PREFIX}${raw.id}`,
    title: decodeEntities(raw.title),
    artist: decodeEntities(artists),
    thumb: thumbOf(raw.image),
    album: info?.album ? decodeEntities(info.album) : null,
    artistId: null,
    albumId: null,
    duration: Number.isFinite(seconds) ? seconds : 0,
    explicit: raw.explicit_content === "1",
    isVideo: false,
  };
}

async function jioSaavnCall(params: Record<string, string>): Promise<unknown> {
  const url = new URL(API_URL);
  const query = { _format: "json", _marker: "0", api_version: "4", ctx: "android", ...params };
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url.href, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`JioSaavn HTTP ${response.status}`);
  return response.json();
}

export async function searchJioSaavnSongs(query: string, limit = 10): Promise<SearchSong[]> {
  const q = query.trim();
  if (!q) return [];
  const body = (await jioSaavnCall({ __call: "search.getResults", p: "1", n: String(limit), q })) as {
    results?: RawSong[];
  };
  return (body.results ?? []).map(mapJioSaavnSong).filter((song): song is SearchSong => song !== null);
}

function songFromDetails(body: unknown, saavnId: string): RawSong | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const songs = record.songs;
  const candidate = record[saavnId] ?? (Array.isArray(songs) ? songs[0] : undefined);
  return candidate && typeof candidate === "object" ? (candidate as RawSong) : null;
}

export function jioSaavnBitrateFor(maxKbps: number | undefined): 96 | 160 | 320 {
  if (maxKbps === undefined || maxKbps >= 256) return 320;
  if (maxKbps >= 128) return 160;
  return 96;
}

function withRendition(url: string, kbps: number): string | null {
  const match = RENDITION.exec(url);
  if (!match) return null;
  return url.replace(RENDITION, `_${kbps}.${match[2]}`);
}

async function probeAudio(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.status === 200 || response.status === 206;
  } catch {
    return false;
  }
}

async function chooseStreamUrl(
  decrypted: string,
  wanted: number,
  supports320: boolean,
): Promise<{ url: string; kbps: number | undefined }> {
  const ladder = [320, 160, 96].filter((kbps) => kbps <= wanted && (kbps !== 320 || supports320));
  for (const kbps of ladder) {
    const url = withRendition(decrypted, kbps);
    if (url && (await probeAudio(url))) return { url, kbps };
  }
  const offered = RENDITION.exec(decrypted);
  return { url: decrypted, kbps: offered ? Number(offered[1]) : undefined };
}

export async function resolveJioSaavnStream(id: string, maxKbps: number | undefined): Promise<ResolvedStream> {
  if (!useSettings.getState().jiosaavnEnabled) throw new Error("The JioSaavn catalogue is turned off");
  const saavnId = saavnIdOf(id);
  const body = await jioSaavnCall({ __call: "song.getDetails", pids: saavnId });
  const info = songFromDetails(body, saavnId)?.more_info;
  const encrypted = info?.encrypted_media_url;
  let decrypted = "";
  if (encrypted) {
    try {
      decrypted = decryptDesEcbBase64(encrypted, MEDIA_KEY);
    } catch {
      decrypted = "";
    }
  }
  if (!decrypted) throw new Error(`JioSaavn has no playable stream for ${saavnId}`);
  const chosen = await chooseStreamUrl(decrypted, jioSaavnBitrateFor(maxKbps), info?.["320kbps"] === "true");
  return { url: chosen.url, mime: "audio/mp4", lufs: null, kbps: chosen.kbps };
}

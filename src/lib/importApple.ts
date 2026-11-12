import { fetch } from "@tauri-apps/plugin-http";
import { clip, durationOf, MAX_SONGS, type ImportSong } from "./importParse";

const REQUEST_TIMEOUT_MS = 15_000;
const APPLE_HOST = "music.apple.com";
const PLAYLIST_ID = /^pl\./i;
const SERVER_DATA = /<script[^>]+id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/;
const SCHEMA_DATA = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/;
const HEADER_SECTION = "containerDetailHeaderLockup";
const TRACK_SECTION = "trackLockup";
const FALLBACK_NAME = "Apple Music playlist";
const NOT_A_LINK = "That isn't an Apple Music link.";
const PRIVATE_TEXT = "That playlist is private or no longer exists.";
const CHANGED_TEXT = "Apple Music changed something, so Hushio couldn't read it. Try again later.";
const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/i;

export type AppleCollection = {
  name: string;
  owner?: string;
  thumb: string | null;
  songs: ImportSong[];
  total: number;
};

type Json = Record<string, unknown>;

type Found = Omit<AppleCollection, "total">;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function at(node: unknown, ...path: string[]): unknown {
  let current = node;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export function appleLinkParts(link: string): { kind: "playlist" | "album"; id: string } | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname.toLowerCase() !== APPLE_HOST) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] && /^[a-z]{2}$/i.test(segments[0])) segments.shift();
  const kind = segments[0]?.toLowerCase();
  if (kind === "playlist") {
    const id = segments.slice(1).find((segment) => PLAYLIST_ID.test(segment));
    return id ? { kind: "playlist", id } : null;
  }
  if (kind === "album") {
    const id = segments.at(-1);
    return id ? { kind: "album", id } : null;
  }
  return null;
}

function artworkOf(node: unknown): string | null {
  const url = textOf(at(node, "dictionary", "url"));
  if (!url) return null;
  return url.replace("{w}", "600").replace("{h}", "600").replace("{f}", "jpg");
}

function isoSeconds(value: string): number {
  const match = ISO_DURATION.exec(value.trim());
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return durationOf(hours * 3600 + minutes * 60 + seconds);
}

function dedupe(songs: ImportSong[]): ImportSong[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = `${song.title}|${song.artist}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionsOf(data: unknown): Json[] {
  return list(at(data, "data")).flatMap((page) => list(at(page, "data", "sections")));
}

function trackOf(item: Json, album: string): ImportSong | null {
  const title = clip(textOf(item.title).trim());
  if (!title) return null;
  return {
    title,
    artist: clip(textOf(item.artistName).trim()),
    ...(album ? { album } : {}),
    duration: durationOf(Number(item.duration) / 1000),
    thumb: artworkOf(item.artwork),
  };
}

function fromServerData(data: unknown): Found | null {
  const sections = sectionsOf(data);
  const header = sections.find((section) => section.itemKind === HEADER_SECTION);
  const head = header ? list(header.items)[0] : undefined;
  const rows = sections.filter((section) => section.itemKind === TRACK_SECTION).flatMap((section) => list(section.items));
  if (!head && rows.length === 0) return null;
  const name = clip(textOf(at(head, "title")).trim());
  const isAlbum = at(head, "contentDescriptor", "kind") === "album";
  const owner = clip(textOf(at(list(at(head, "subtitleLinks"))[0], "title")).trim());
  const songs = rows.map((item) => trackOf(item, isAlbum ? name : "")).filter((song): song is ImportSong => song !== null);
  return {
    name,
    owner: owner || undefined,
    thumb: artworkOf(at(head, "artwork")),
    songs: dedupe(songs),
  };
}

function fromSchema(data: unknown): Found | null {
  if (!isRecord(data)) return null;
  const name = clip(textOf(data.name).trim());
  const byArtist = textOf(at(list(data.byArtist)[0], "name")).trim();
  const curator = textOf(at(data.author, "name")).trim();
  const songs = list(data.tracks ?? data.track)
    .map((entry) => {
      const title = clip(textOf(entry.name).trim());
      if (!title) return null;
      return { title, artist: clip(byArtist), duration: isoSeconds(textOf(entry.duration)) };
    })
    .filter((song): song is ImportSong => song !== null);
  if (!name && songs.length === 0) return null;
  return {
    name,
    owner: clip(byArtist || curator) || undefined,
    thumb: null,
    songs: dedupe(songs),
  };
}

function embedded(pattern: RegExp, html: string): unknown {
  const match = pattern.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function parseApplePage(html: string): AppleCollection {
  const candidates = [fromServerData(embedded(SERVER_DATA, html)), fromSchema(embedded(SCHEMA_DATA, html))];
  const found = candidates.find(
    (collection): collection is Found => collection !== null && (collection.name !== "" || collection.songs.length > 0),
  );
  if (!found) {
    if (candidates.some((collection) => collection !== null)) throw new Error(PRIVATE_TEXT);
    throw new Error(CHANGED_TEXT);
  }
  const songs = found.songs.slice(0, MAX_SONGS);
  return {
    name: found.name || FALLBACK_NAME,
    owner: found.owner,
    thumb: found.thumb,
    songs,
    total: found.songs.length,
  };
}

async function fetchPage(link: string): Promise<string> {
  const response = await fetch(link, {
    method: "GET",
    headers: { Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) throw new Error(PRIVATE_TEXT);
  if (!response.ok) throw new Error(`Apple Music didn't answer (HTTP ${response.status}).`);
  return response.text();
}

export async function readAppleCollection(link: string): Promise<AppleCollection> {
  if (!appleLinkParts(link)) throw new Error(NOT_A_LINK);
  const html = await fetchPage(link.trim());
  return parseApplePage(html);
}

import { APP_SLUG } from "./app";
import { clip, durationOf, MAX_SONGS } from "./importParse";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_ID = /(?:[?&]v=|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/;
const EXTINF = /^#EXTINF:(-?\d+)[^,]*,(.*)$/;
const NAME_MAX = 200;

export type PlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  thumb: string;
  duration: number;
  album?: string;
};

export type ParsedPlaylist = {
  name: string;
  tracks: PlaylistTrack[];
  skipped: number;
};

export function trackFrom(
  id: string,
  title: string,
  artist: string,
  duration: number,
  album?: string,
): PlaylistTrack {
  const track: PlaylistTrack = {
    id,
    title: clip(title.trim()) || "Unknown title",
    artist: clip(artist.trim()) || "Unknown artist",
    thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: durationOf(duration),
  };
  if (album) track.album = clip(album);
  return track;
}

function nameOf(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, NAME_MAX) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(text: string, fallbackName: string): ParsedPlaylist {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { name: fallbackName, tracks: [], skipped: 0 };
  }
  if (!isRecord(doc) || doc.format !== `${APP_SLUG}-playlist` || !Array.isArray(doc.tracks)) {
    return { name: fallbackName, tracks: [], skipped: 0 };
  }

  const tracks: PlaylistTrack[] = [];
  let skipped = 0;
  for (const row of doc.tracks) {
    if (!isRecord(row) || typeof row.id !== "string" || !YT_ID.test(row.id) || tracks.length >= MAX_SONGS) {
      skipped += 1;
      continue;
    }
    tracks.push(
      trackFrom(
        row.id,
        typeof row.title === "string" ? row.title : "",
        typeof row.artist === "string" ? row.artist : "",
        Number(row.duration) || 0,
        typeof row.album === "string" && row.album ? row.album : undefined,
      ),
    );
  }
  return { name: nameOf(doc.name, fallbackName), tracks, skipped };
}

function splitInfo(info: string): [string, string] {
  const index = info.indexOf(" - ");
  return index < 0 ? ["", info] : [info.slice(0, index), info.slice(index + 3)];
}

function parseM3u(text: string, fallbackName: string): ParsedPlaylist {
  let name = fallbackName;
  let pending: { duration: number; artist: string; title: string } | null = null;
  const tracks: PlaylistTrack[] = [];
  let skipped = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#PLAYLIST:")) {
      name = nameOf(line.slice("#PLAYLIST:".length), fallbackName);
      continue;
    }
    const info = EXTINF.exec(line);
    if (info) {
      const [artist, title] = splitInfo(info[2]);
      pending = { duration: Number(info[1]), artist, title };
      continue;
    }
    if (line.startsWith("#")) continue;

    const match = VIDEO_ID.exec(line);
    if (match && tracks.length < MAX_SONGS) {
      tracks.push(
        trackFrom(match[1], pending?.title ?? "", pending?.artist ?? "", pending?.duration ?? 0),
      );
    } else {
      skipped += 1;
    }
    pending = null;
  }
  return { name, tracks, skipped };
}

export function parsePlaylistFile(input: string, fallbackName: string): ParsedPlaylist {
  const text = input.replace(/^\uFEFF/, "").trim();
  return text.startsWith("{") ? parseJson(text, fallbackName) : parseM3u(text, fallbackName);
}

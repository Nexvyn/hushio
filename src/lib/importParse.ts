export const MAX_SONGS = 5000;
const TEXT_MAX = 300;
const DAY_SECONDS = 86_400;

const SPOTIFY_LINK = /^(?:https?:\/\/(?:open\.spotify\.com|spotify\.link)\/\S+|spotify:(?:user:\S+:)?(?:playlist|album|track):\S+)$/i;
const DASH = /\s[-–—]\s/;
const NUMBERING = /^\s*(?:\d{1,4}[.)]\s+|[-*•]\s+)/;

const TITLE_HEADERS = [/^(track|song)( name)?$/, /^title$/, /^name$/];
const ARTIST_HEADERS = [/^artist( name)?(\(s\))?s?$/, /^artists?$/];
const ALBUM_HEADERS = [/^album( name)?$/];
const MS_HEADERS = [/^duration( \(ms\)|_ms)$/, /^track duration \(ms\)$/];
const CLOCK_HEADERS = [/^duration$/, /^length$/];

export type ImportSong = {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  spotifyId?: string;
  thumb?: string | null;
  explicit?: boolean;
};

export function clip(value: string): string {
  return value.slice(0, TEXT_MAX);
}

export function durationOf(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 && seconds < DAY_SECONDS ? Math.round(seconds) : 0;
}

export function isSpotifyLink(text: string): boolean {
  return SPOTIFY_LINK.test(text.trim());
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]+$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LINK = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be)(?:[/?#:]|$)/i;
const RADIO_PREFIX = /^(?:AMVM|EM|AM|MM)/;

export function isYouTubeLink(text: string): boolean {
  const body = text.trim();
  return !/\s/.test(body) && YOUTUBE_LINK.test(body);
}

function youtubeUrl(text: string): URL | null {
  const body = text.trim();
  if (!isYouTubeLink(body)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(body) ? body : `https://${body}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function youtubePlaylistId(text: string): string | null {
  const url = youtubeUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const onShortLink = host === "youtu.be" && url.pathname.length > 1;
  const onYouTube = YOUTUBE_HOSTS.has(host) && (url.pathname === "/playlist" || url.pathname === "/watch");
  if (!onShortLink && !onYouTube) return null;
  const list = url.searchParams.get("list");
  if (!list || !YOUTUBE_LIST_ID.test(list)) return null;
  if (list.startsWith("RD") && !list.startsWith("RDCLAK")) return null;
  return list;
}

export function youtubeMixSeed(text: string): string | null {
  const url = youtubeUrl(text);
  const list = url?.searchParams.get("list") ?? "";
  if (!url || !list.startsWith("RD") || list.startsWith("RDCLAK") || !YOUTUBE_LIST_ID.test(list)) return null;
  const video = url.searchParams.get("v") ?? "";
  if (VIDEO_ID.test(video)) return video;
  const seed = list.slice(2).replace(RADIO_PREFIX, "");
  return VIDEO_ID.test(seed) ? seed : null;
}

export function clock(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

type CsvState = { quoted: boolean; cellStart: boolean };

const CSV_START: CsvState = { quoted: false, cellStart: true };

function scanCsvLine(line: string, state: CsvState): CsvState {
  let { quoted, cellStart } = state;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') index += 1;
        else quoted = false;
      }
    } else if (char === '"' && cellStart) {
      quoted = true;
      cellStart = false;
    } else if (char === ",") {
      cellStart = true;
    } else if (char !== " ") {
      cellStart = false;
    }
  }
  return { quoted, cellStart };
}

export function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStart = true;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
    } else if (char === '"' && cellStart) {
      quoted = true;
      cellStart = false;
    } else if (char === ",") {
      cells.push(cell.trim());
      cell = "";
      cellStart = true;
    } else {
      cell += char;
      if (char !== " ") cellStart = false;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function csvRows(text: string): { rows: string[][]; malformed: number } {
  const lines = text.split(/\r?\n/);
  const rows: string[][] = [];
  let malformed = 0;
  let start = 0;
  while (start < lines.length) {
    let state = scanCsvLine(lines[start], CSV_START);
    let end = start;
    while (state.quoted && end + 1 < lines.length) {
      end += 1;
      state = scanCsvLine(lines[end], state);
    }
    if (state.quoted) {
      malformed += 1;
      start += 1;
      continue;
    }
    const row = lines.slice(start, end + 1).join("\n");
    if (row.trim()) rows.push(csvCells(row));
    start = end + 1;
  }
  return { rows, malformed };
}

export type ParsedSongs = { songs: ImportSong[]; malformed: number };

function column(header: string[], patterns: RegExp[]): number {
  return header.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function parseCsv(body: string): ParsedSongs | null {
  const { rows, malformed } = csvRows(body);
  const [headerRow = [], ...data] = rows;
  const header = headerRow.map((cell) => cell.toLowerCase());
  const titleIndex = column(header, TITLE_HEADERS);
  if (titleIndex < 0) return null;
  const artistIndex = column(header, ARTIST_HEADERS);
  const albumIndex = column(header, ALBUM_HEADERS);
  const msIndex = column(header, MS_HEADERS);
  const clockIndex = column(header, CLOCK_HEADERS);

  const songs: ImportSong[] = [];
  for (const row of data) {
    const title = clip((row[titleIndex] ?? "").trim());
    if (!title) continue;
    const artist = clip((row[artistIndex] ?? "").replace(/\s*;\s*/g, ", "));
    const album = clip(row[albumIndex] ?? "");
    let seconds = 0;
    if (msIndex >= 0) {
      seconds = Number(row[msIndex]) / 1000;
    } else if (clockIndex >= 0) {
      seconds = clock(row[clockIndex] ?? "");
    }
    songs.push({ title, artist, ...(album ? { album } : {}), duration: durationOf(seconds) });
    if (songs.length === MAX_SONGS) break;
  }
  return { songs, malformed };
}

function parseText(body: string): ImportSong[] {
  const songs: ImportSong[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(NUMBERING, "").trim();
    if (!line || line.startsWith("#")) continue;
    const separator = DASH.exec(line);
    const artist = separator ? line.slice(0, separator.index).trim() : "";
    const title = clip(separator ? line.slice(separator.index + separator[0].length).trim() : line);
    if (!title) continue;
    songs.push({ title, artist: clip(artist), duration: 0 });
    if (songs.length === MAX_SONGS) break;
  }
  return songs;
}

export function parseSongListReport(input: string): ParsedSongs {
  const body = input.replace(/^\uFEFF/, "").trim();
  if (!body) return { songs: [], malformed: 0 };
  const [firstLine = ""] = body.split(/\r?\n/);
  if (firstLine.toLowerCase().includes(",")) {
    const csv = parseCsv(body);
    if (csv) return csv;
  }
  return { songs: parseText(body), malformed: 0 };
}

export function parseSongList(input: string): ImportSong[] {
  return parseSongListReport(input).songs;
}

export const MAX_SONGS = 5000;
const TEXT_MAX = 300;
const DAY_SECONDS = 86_400;

const PLAYLIST_LINK = /^(?:https?:\/\/(?:open\.spotify\.com|spotify\.link)\/\S+|spotify:(?:user:\S+:)?playlist:\S+)$/i;
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

export function isPlaylistLink(text: string): boolean {
  return PLAYLIST_LINK.test(text.trim());
}

export function clock(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
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
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let pending = "";
  for (const line of text.split(/\r?\n/)) {
    pending = pending ? `${pending}\n${line}` : line;
    if (pending.split('"').length % 2 === 0) continue;
    if (pending.trim()) rows.push(csvCells(pending));
    pending = "";
  }
  if (pending.trim()) rows.push(csvCells(pending));
  return rows;
}

function column(header: string[], patterns: RegExp[]): number {
  return header.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function parseCsv(body: string): ImportSong[] | null {
  const rows = csvRows(body);
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
  return songs;
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

export function parseSongList(input: string): ImportSong[] {
  const body = input.replace(/^\uFEFF/, "").trim();
  if (!body) return [];
  const [firstLine = ""] = body.split(/\r?\n/);
  if (firstLine.toLowerCase().includes(",")) {
    const csv = parseCsv(body);
    if (csv) return csv;
  }
  return parseText(body);
}

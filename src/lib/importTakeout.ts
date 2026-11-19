import { clip, csvRows, MAX_SONGS } from "./importParse";
import { YT_ID } from "./importPlaylistFile";

const LIKED_FILE = /^liked (music|videos)/i;
const LIBRARY_ARTIST = /^artist name \d+$/;
const HEADER_SCAN_ROWS = 15;

export type TakeoutSong = { id: string; title: string; artist: string; album?: string };
type TakeoutIndex = { kind: "index"; titles: Map<string, string> };
type TakeoutLibrary = { kind: "library"; songs: TakeoutSong[]; skipped: number };
type TakeoutList = { kind: "playlist" | "liked"; name: string; ids: string[]; skipped: number };
export type TakeoutFile = TakeoutIndex | TakeoutLibrary | TakeoutList;

export function takeoutName(fileName: string): string {
  return fileName.replace(/(?:-videos)?\.csv$/i, "");
}

function findHeader(rows: string[][], columns: string[]): number {
  return rows.slice(0, HEADER_SCAN_ROWS).findIndex((row) => {
    const cells = row.map((cell) => cell.toLowerCase());
    return columns.every((column) => cells.includes(column));
  });
}

function playlistIndex(rows: string[][], headerAt: number): TakeoutIndex {
  const header = rows[headerAt].map((cell) => cell.toLowerCase());
  const idColumn = header.indexOf("playlist id");
  const titleColumn = header.indexOf("playlist title (original)");
  const titles = new Map<string, string>();
  for (const row of rows.slice(headerAt + 1)) {
    const id = (row[idColumn] ?? "").trim();
    const title = clip((row[titleColumn] ?? "").trim());
    if (id && title) titles.set(id, title);
  }
  return { kind: "index", titles };
}

function libraryOf(header: string[], body: string[][], idColumn: number, titleColumn: number): TakeoutLibrary {
  const albumColumn = header.indexOf("album title");
  const artistColumns = header.flatMap((cell, index) => (LIBRARY_ARTIST.test(cell) ? [index] : []));
  const songs: TakeoutSong[] = [];
  let skipped = 0;
  for (const row of body) {
    if (songs.length === MAX_SONGS) break;
    const id = (row[idColumn] ?? "").trim();
    const title = clip((row[titleColumn] ?? "").trim());
    if (!YT_ID.test(id) || !title) {
      skipped += 1;
      continue;
    }
    const artist = clip(artistColumns.map((index) => (row[index] ?? "").trim()).filter(Boolean).join(", "));
    const album = albumColumn >= 0 ? clip((row[albumColumn] ?? "").trim()) : "";
    songs.push({ id, title, artist, ...(album ? { album } : {}) });
  }
  return { kind: "library", songs, skipped };
}

export function takeoutFile(fileName: string, text: string): TakeoutFile | null {
  const { rows } = csvRows(text.replace(/^﻿/, ""));
  const indexAt = findHeader(rows, ["playlist id", "playlist title (original)"]);
  if (indexAt >= 0) return playlistIndex(rows, indexAt);

  const headerAt = findHeader(rows, ["video id"]);
  if (headerAt < 0) return null;
  const header = rows[headerAt].map((cell) => cell.toLowerCase());
  const body = rows.slice(headerAt + 1);
  const idColumn = header.indexOf("video id");
  const titleColumn = header.indexOf("song title");
  if (titleColumn >= 0) return libraryOf(header, body, idColumn, titleColumn);

  const ids: string[] = [];
  let skipped = 0;
  for (const row of body) {
    if (ids.length === MAX_SONGS) break;
    const id = (row[idColumn] ?? "").trim();
    if (YT_ID.test(id)) ids.push(id);
    else skipped += 1;
  }
  const name = takeoutName(fileName);
  const kind = LIKED_FILE.test(name) ? "liked" : "playlist";
  return { kind, name, ids, skipped };
}

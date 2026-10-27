import { isPlaylistLink, parseSongListReport, type ImportSong } from "./importParse";
import { parsePlaylistFile, type PlaylistTrack } from "./importPlaylistFile";
import { readPublicPlaylist } from "./importSpotify";
import { plural } from "./plural";
import type { SearchSong } from "./searchParse";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";

const KEEP = 10;
const DEFAULT_NAME = "Imported playlist";
const NO_SONGS = "No songs found. Paste a playlist link, or one song per line (Artist - Title).";
const READ_FAILED = "Couldn't read that playlist.";

export type StagedImport = {
  name: string;
  owner?: string;
  thumb?: string | null;
  songs: ImportSong[];
  total: number;
  malformed?: number;
  fromSpotify: boolean;
};

const staged = new Map<string, StagedImport>();
let counter = 0;

export function stageImport(playlist: StagedImport): string {
  counter += 1;
  const id = `import-${counter}`;
  staged.set(id, playlist);
  for (const key of [...staged.keys()].slice(0, -KEEP)) staged.delete(key);
  return id;
}

export function pendingImport(id: string): StagedImport | null {
  return staged.get(id) ?? null;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function importFromText(text: string, name = DEFAULT_NAME): Promise<string | null> {
  const body = text.trim();
  if (!body) return null;
  const toast = useUI.getState().toast;

  if (isPlaylistLink(body)) {
    toast("Reading the playlist…");
    try {
      const playlist = await readPublicPlaylist(body);
      return stageImport({ ...playlist, fromSpotify: true });
    } catch (error) {
      toast(messageOf(error, READ_FAILED), "error");
      return null;
    }
  }

  const { songs, malformed } = parseSongListReport(body);
  if (songs.length === 0) {
    toast(NO_SONGS, "error");
    return null;
  }
  return stageImport({ name, songs, total: songs.length, malformed, fromSpotify: false });
}

export function saveImportedPlaylist(name: string, songs: SearchSong[]): string {
  const id = useLibrary.getState().createPlaylist(name);
  for (const song of songs) useLibrary.getState().addToPlaylist(id, song);
  return id;
}

function addTracks(name: string, tracks: PlaylistTrack[]): string {
  const id = useLibrary.getState().createPlaylist(name);
  for (const track of tracks) useLibrary.getState().addToPlaylist(id, track);
  return id;
}

export function importPlaylistFile(text: string, fileName: string): string | null {
  const toast = useUI.getState().toast;
  const parsed = parsePlaylistFile(text, fileName);
  if (parsed.tracks.length === 0) {
    toast("No YouTube Music songs found in that file", "error");
    return null;
  }
  const id = addTracks(parsed.name, parsed.tracks);
  const count = plural(parsed.tracks.length, "song", "songs");
  toast(
    parsed.skipped > 0
      ? `Imported ${count} (${parsed.skipped} without a YouTube link were skipped)`
      : `Imported ${count}`,
    "success",
  );
  return id;
}

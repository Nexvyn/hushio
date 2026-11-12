import { getPlaylistPage } from "./browse";
import { getRadio, type RadioItem, type RadioPage, type RadioSeed } from "./innertube";
import {
  isSpotifyLink,
  isYouTubeLink,
  MAX_SONGS,
  parseSongListReport,
  youtubeMixSeed,
  youtubePlaylistId,
  type ImportSong,
} from "./importParse";
import { parsePlaylistFile, trackFrom, type PlaylistTrack } from "./importPlaylistFile";
import { appleLinkParts, readAppleCollection } from "./importApple";
import { readSpotifyLink } from "./importSpotify";
import { takeoutFile, type TakeoutFile, type TakeoutSong } from "./importTakeout";
import { plural } from "./plural";
import type { SearchSong } from "./searchParse";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";

const KEEP = 10;
const DEFAULT_NAME = "Imported playlist";
const MIX_NAME = "YouTube Mix";
const MIX_SIZE = 50;
const NO_SONGS = "No songs found. Paste a playlist link, or one song per line (Artist - Title).";
const READ_FAILED = "Couldn't read that playlist.";
const YOUTUBE_READ_FAILED = "Couldn't read that playlist. Check the link is public.";
const YOUTUBE_EMPTY = "That playlist has no songs.";
const MIX_READ_FAILED = "Couldn't read that mix.";
const MIX_EMPTY = "That mix has no songs.";
const NOT_A_PLAYLIST = "That link isn't a playlist.";
const TEXT_EXTENSIONS = new Set(["csv", "txt"]);
const RESOLVE_WORKERS = 4;
const PROGRESS_EVERY = 10;
const PROGRESS_MS = 60_000;
const NO_FILE_SONGS = "No songs found in those files.";
const NEEDS_MATCHING = "Text lists need matching, so import them one at a time.";

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
  const { toast, dismissToast } = useUI.getState();

  const youtubeId = youtubePlaylistId(body);
  if (youtubeId) return importYouTubePlaylist(youtubeId);

  const mixSeed = youtubeMixSeed(body);
  if (mixSeed) return importYouTubeMix(mixSeed);

  if (isYouTubeLink(body)) {
    toast(NOT_A_PLAYLIST, "error");
    return null;
  }

  if (isSpotifyLink(body)) {
    const loading = toast("Reading the playlist…");
    try {
      const playlist = await readSpotifyLink(body);
      return stageImport({ ...playlist, fromSpotify: true });
    } catch (error) {
      toast(messageOf(error, READ_FAILED), "error");
      return null;
    } finally {
      dismissToast(loading);
    }
  }

  if (appleLinkParts(body)) {
    const loading = toast("Reading the playlist…");
    try {
      const collection = await readAppleCollection(body);
      return stageImport({ ...collection, fromSpotify: false });
    } catch (error) {
      toast(messageOf(error, READ_FAILED), "error");
      return null;
    } finally {
      dismissToast(loading);
    }
  }

  const { songs, malformed } = parseSongListReport(body);
  if (songs.length === 0) {
    toast(NO_SONGS, "error");
    return null;
  }
  return stageImport({ name, songs, total: songs.length, malformed, fromSpotify: false });
}

async function importYouTubePlaylist(listId: string): Promise<string | null> {
  const { toast, dismissToast } = useUI.getState();
  const loading = toast("Reading the playlist…");
  let page: Awaited<ReturnType<typeof getPlaylistPage>>;
  try {
    page = await getPlaylistPage(listId);
  } catch {
    toast(YOUTUBE_READ_FAILED, "error");
    return null;
  } finally {
    dismissToast(loading);
  }
  const songs = page.tracks.slice(0, MAX_SONGS);
  if (songs.length === 0) {
    toast(YOUTUBE_EMPTY, "error");
    return null;
  }
  const name = page.title || DEFAULT_NAME;
  const id = saveImportedPlaylist(name, songs);
  toast(`Saved “${name}” to your library`, "success");
  return id;
}

function mixSong(seedId: string, seed: RadioSeed): SearchSong {
  return {
    id: seedId,
    title: seed.title,
    artist: seed.artist,
    thumb: seed.thumb,
    artistId: seed.artistId,
    albumId: null,
    album: null,
    duration: seed.duration,
    explicit: false,
    isVideo: false,
  };
}

function radioSong(item: RadioItem): SearchSong {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    thumb: item.thumb,
    artistId: item.artistId,
    albumId: null,
    album: null,
    duration: item.duration,
    explicit: item.explicit,
    isVideo: item.videoType === "video",
  };
}

async function importYouTubeMix(seedId: string): Promise<string | null> {
  const { toast, dismissToast } = useUI.getState();
  const loading = toast("Reading the mix…");
  let radio: RadioPage | null;
  try {
    radio = await getRadio(seedId);
  } catch {
    toast(MIX_READ_FAILED, "error");
    return null;
  } finally {
    dismissToast(loading);
  }
  const candidates = [
    ...(radio?.seed ? [mixSong(seedId, radio.seed)] : []),
    ...(radio?.items ?? []).filter((item) => item.videoType !== "episode").map(radioSong),
  ];
  const songs: SearchSong[] = [];
  const seen = new Set<string>();
  for (const song of candidates) {
    if (songs.length === MIX_SIZE) break;
    if (seen.has(song.id)) continue;
    seen.add(song.id);
    songs.push(song);
  }
  if (songs.length === 0) {
    toast(MIX_EMPTY, "error");
    return null;
  }
  const seedTitle = radio?.seed?.title;
  const name = seedTitle ? `${seedTitle} Mix` : MIX_NAME;
  const id = saveImportedPlaylist(name, songs);
  toast(`Saved “${name}” to your library`, "success");
  return id;
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
    toast("No songs found in that file", "error");
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

export type ImportFile = { name: string; text: string };

type BatchEntry = { file: ImportFile; data: TakeoutFile | null };

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function listNameOf(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  if (/^liked[ _]songs$/i.test(base)) return "Liked Songs";
  return base || DEFAULT_NAME;
}

async function importOne(file: ImportFile): Promise<string | null> {
  const name = listNameOf(file.name);
  if (TEXT_EXTENSIONS.has(extensionOf(file.name))) return importFromText(file.text, name);
  return importPlaylistFile(file.text, name);
}

async function trackById(id: string): Promise<PlaylistTrack | null> {
  try {
    const seed = (await getRadio(id))?.seed;
    return seed?.title ? trackFrom(id, seed.title, seed.artist, seed.duration) : null;
  } catch {
    return null;
  }
}

async function resolveTitles(ids: string[], onStep: (done: number) => void): Promise<Map<string, PlaylistTrack>> {
  const found = new Map<string, PlaylistTrack>();
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (next < ids.length) {
      const id = ids[next];
      next += 1;
      const track = await trackById(id);
      if (track) found.set(id, track);
      done += 1;
      onStep(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(RESOLVE_WORKERS, ids.length) }, worker));
  return found;
}

function likeTracks(tracks: PlaylistTrack[]): number {
  return useLibrary.getState().likeMany(tracks);
}

function likeSongs(songs: TakeoutSong[]): number {
  return likeTracks(songs.map((song) => trackFrom(song.id, song.title, song.artist, 0, song.album)));
}

async function importBatch(entries: BatchEntry[]): Promise<string | null> {
  const { toast, dismissToast } = useUI.getState();
  const names = new Map<string, string>();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const { data } of entries) {
    if (data?.kind === "index") for (const [id, title] of data.titles) names.set(id, title);
    if (data && (data.kind === "playlist" || data.kind === "liked")) {
      for (const id of data.ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
  }

  const progress: { id: number | null } = { id: null };
  const show = (message: string) => {
    if (progress.id !== null) dismissToast(progress.id);
    progress.id = toast(message, "info", PROGRESS_MS);
  };
  if (ids.length > 0) show(`Reading 0 of ${ids.length} songs…`);
  const titles = await resolveTitles(ids, (done) => {
    if (done % PROGRESS_EVERY === 0 || done === ids.length) show(`Reading ${done} of ${ids.length} songs…`);
  });
  if (progress.id !== null) dismissToast(progress.id);

  let playlists = 0;
  let liked = 0;
  let skipped = 0;
  let needsMatching = 0;
  let lastId: string | null = null;
  for (const { file, data } of entries) {
    if (!data) {
      if (TEXT_EXTENSIONS.has(extensionOf(file.name))) {
        needsMatching += 1;
        continue;
      }
      const parsed = parsePlaylistFile(file.text, listNameOf(file.name));
      skipped += parsed.skipped;
      if (parsed.tracks.length === 0) continue;
      lastId = addTracks(parsed.name, parsed.tracks);
      playlists += 1;
      continue;
    }
    if (data.kind === "index") continue;
    if (data.kind === "library") {
      liked += likeSongs(data.songs);
      skipped += data.skipped;
      continue;
    }
    const tracks: PlaylistTrack[] = [];
    for (const id of data.ids) {
      const track = titles.get(id);
      if (track) tracks.push(track);
    }
    skipped += data.skipped + (data.ids.length - tracks.length);
    if (data.kind === "liked") {
      liked += likeTracks(tracks);
      continue;
    }
    if (tracks.length === 0) continue;
    lastId = addTracks(names.get(data.name) ?? data.name, tracks);
    playlists += 1;
  }

  const parts: string[] = [];
  if (playlists > 0) parts.push(plural(playlists, "playlist", "playlists"));
  if (liked > 0) parts.push(plural(liked, "liked song", "liked songs"));
  if (parts.length === 0) {
    toast(needsMatching > 0 ? NEEDS_MATCHING : NO_FILE_SONGS, "error");
    return null;
  }
  let message = `Imported ${parts.join(" and ")}`;
  if (skipped > 0) message += ` (${plural(skipped, "song", "songs")} skipped)`;
  if (needsMatching > 0) message += `. ${NEEDS_MATCHING}`;
  toast(message, "success");
  return lastId;
}

export async function importFiles(files: ImportFile[]): Promise<string | null> {
  const entries: BatchEntry[] = files.map((file) => ({
    file,
    data: extensionOf(file.name) === "csv" ? takeoutFile(file.name, file.text) : null,
  }));
  if (files.length === 1 && entries[0].data === null) return importOne(files[0]);
  return importBatch(entries);
}

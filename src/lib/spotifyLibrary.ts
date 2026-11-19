import { fetch } from "@tauri-apps/plugin-http";
import { spotifyAccessToken } from "./bridge";
import { clip, durationOf, MAX_SONGS, type ImportSong } from "./importParse";
import type { StagedImport } from "./importStage";

const API = "https://api.spotify.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const PLAYLIST_PAGE = 50;
const LIKED_PAGE = 50;
const SONG_PAGE = 100;
const MAX_PLAYLISTS = 500;
const MAX_PAGES = 200;
const COVER_MIN = 300;
const UNTITLED = "Untitled playlist";
export const LIKED_NAME = "Liked Songs";
const TRUNCATED = `Only the first ${MAX_SONGS} songs are imported.`;

export type SpotifyImage = { url?: string | null; width?: number | null };

export type SpotifyTrack = {
  id?: string | null;
  name?: string | null;
  type?: string;
  is_local?: boolean;
  artists?: { name?: string | null }[] | null;
  album?: { name?: string | null; images?: SpotifyImage[] | null } | null;
  duration_ms?: number | null;
  explicit?: boolean;
};

type TrackEntry = { track?: SpotifyTrack | null; item?: SpotifyTrack | null };

type RawPlaylist = {
  id?: string | null;
  name?: string | null;
  images?: SpotifyImage[] | null;
  tracks?: { total?: number } | null;
  items?: { total?: number } | null;
};

type Paging<T> = { items?: (T | null)[] | null; next?: string | null; total?: number };

export type SpotifyPlaylist = { id: string; name: string; thumb: string | null; total: number };

export type SpotifySource = { kind: "liked" } | { kind: "playlist"; playlist: SpotifyPlaylist };

export type SpotifyImportList = Omit<StagedImport, "fromSpotify">;

export type Getter = (url: string) => Promise<unknown>;

export function coverOf(images: SpotifyImage[] | null | undefined): string | null {
  const ranked = (images ?? [])
    .flatMap((image) => (image.url ? [{ url: image.url, width: image.width ?? 0 }] : []))
    .sort((a, b) => a.width - b.width);
  const chosen = ranked.find((image) => image.width >= COVER_MIN) ?? ranked.at(-1);
  return chosen?.url ?? null;
}

export function songOfTrack(track: SpotifyTrack | null | undefined): ImportSong | null {
  if (!track || track.is_local || track.type === "episode") return null;
  const title = clip((track.name ?? "").trim());
  if (!title) return null;
  const artist = clip(
    (track.artists ?? [])
      .map((item) => (item.name ?? "").trim())
      .filter(Boolean)
      .join(", "),
  );
  const album = clip((track.album?.name ?? "").trim());
  return {
    title,
    artist,
    ...(album ? { album } : {}),
    duration: durationOf((track.duration_ms ?? 0) / 1000),
    ...(track.id ? { spotifyId: track.id } : {}),
    thumb: coverOf(track.album?.images),
    explicit: track.explicit === true,
  };
}

export function playlistOf(raw: RawPlaylist | null | undefined): SpotifyPlaylist | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    name: clip((raw.name ?? "").trim()) || UNTITLED,
    thumb: coverOf(raw.images),
    total: raw.tracks?.total ?? raw.items?.total ?? 0,
  };
}

export async function readPages<T>(
  firstUrl: string,
  get: Getter,
  maxItems: number,
): Promise<{ items: T[]; total: number; truncated: boolean }> {
  const items: T[] = [];
  let total = 0;
  let url: string | null = firstUrl;
  for (let pages = 0; url && items.length < maxItems && pages < MAX_PAGES; pages += 1) {
    const page = (await get(url)) as Paging<T> | null;
    if (!page) break;
    total = page.total ?? total;
    for (const entry of page.items ?? []) {
      if (entry) items.push(entry);
    }
    url = page.next ?? null;
  }
  return { items: items.slice(0, maxItems), total, truncated: url !== null || items.length > maxItems };
}

export async function listPlaylists(get: Getter): Promise<SpotifyPlaylist[]> {
  const { items } = await readPages<RawPlaylist>(`${API}/me/playlists?limit=${PLAYLIST_PAGE}`, get, MAX_PLAYLISTS);
  return items.flatMap((raw) => {
    const playlist = playlistOf(raw);
    return playlist ? [playlist] : [];
  });
}

function songList(
  name: string,
  thumb: string | null,
  page: { items: TrackEntry[]; total: number; truncated: boolean },
): SpotifyImportList {
  const songs = page.items.flatMap((entry) => {
    const song = songOfTrack(entry.track ?? entry.item);
    return song ? [song] : [];
  });
  return {
    name,
    thumb,
    songs,
    total: page.total || songs.length,
    ...(page.truncated ? { warning: TRUNCATED } : {}),
  };
}

export async function readSource(source: SpotifySource, get: Getter): Promise<SpotifyImportList> {
  if (source.kind === "liked") {
    const page = await readPages<TrackEntry>(`${API}/me/tracks?limit=${LIKED_PAGE}`, get, MAX_SONGS);
    return songList(LIKED_NAME, null, page);
  }
  const { playlist } = source;
  const url = `${API}/playlists/${encodeURIComponent(playlist.id)}/tracks?limit=${SONG_PAGE}`;
  const page = await readPages<TrackEntry>(url, get, MAX_SONGS);
  return songList(playlist.name, playlist.thumb, page);
}

export function failureMessage(status: number): string {
  if (status === 401) return "Your Spotify sign-in expired. Disconnect and connect again.";
  if (status === 403) return "Spotify didn't allow access to your library. Disconnect and connect again.";
  if (status === 429) return "Spotify is busy right now. Try again in a minute.";
  return "Couldn't read your Spotify library. Try again.";
}

function spotifyGetter(token: string): Getter {
  return async (url) => {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(failureMessage(response.status));
    return response.json();
  };
}

export async function loadPlaylists(): Promise<SpotifyPlaylist[]> {
  return listPlaylists(spotifyGetter(await spotifyAccessToken()));
}

export async function loadSource(source: SpotifySource): Promise<SpotifyImportList> {
  return readSource(source, spotifyGetter(await spotifyAccessToken()));
}

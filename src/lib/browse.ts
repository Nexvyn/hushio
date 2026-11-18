import { getSession, MARKET, withRetry } from "./innertube";
import {
  parseArtistPage,
  parseReleaseGrid,
  parseReleasePage,
  parseRemotePlaylistPage,
  parseShelfPage,
  uniqueSongs,
  withThumb,
  type ArtistPage,
  type ReleaseCard,
  type ReleasePage,
  type RemotePlaylistPage,
} from "./browseParse";
import { playlistMeta } from "./browseText";
import { MAX_SONGS } from "./importParse";
import type { ShelfMore } from "./home";
import type { SearchSong } from "./searchParse";

export const MAX_SHELF_PAGES = 50;
const MAX_GRID_PAGES = 10;

export function playlistBrowseId(id: string): string {
  return id.startsWith("VL") ? id : `VL${id}`;
}

async function browseRequest(payload: { browseId: string; params?: string } | { continuation: string }): Promise<unknown> {
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/browse", { ...payload, client: "YTMUSIC" }),
  );
  return response.data;
}

async function collectShelf(token: string | null): Promise<{ songs: SearchSong[]; incomplete: boolean }> {
  const songs: SearchSong[] = [];
  const seen = new Set<string>();
  let next = token;
  for (let page = 0; next !== null && page < MAX_SHELF_PAGES && songs.length < MAX_SONGS; page++) {
    const data = await browseRequest({ continuation: next }).catch(() => null);
    if (data === null) break;
    const shelf = parseShelfPage(data);
    const fresh = shelf.songs.filter((song) => !seen.has(song.id));
    if (fresh.length === 0) break;
    for (const song of fresh) seen.add(song.id);
    songs.push(...fresh);
    next = shelf.continuation;
  }
  return { songs: songs.slice(0, MAX_SONGS), incomplete: next !== null };
}

export async function restOfShelf(token: string | null): Promise<SearchSong[]> {
  return (await collectShelf(token)).songs;
}

export async function getArtistPage(artistId: string): Promise<ArtistPage> {
  return parseArtistPage(await browseRequest({ browseId: artistId }), artistId);
}

export async function getReleaseGrid(more: ShelfMore): Promise<ReleaseCard[]> {
  const first = parseReleaseGrid(
    await browseRequest({ browseId: more.browseId, ...(more.params ? { params: more.params } : {}) }),
  );
  const releases = [...first.releases];
  let next = first.continuation;
  for (let page = 1; next !== null && page < MAX_GRID_PAGES; page++) {
    const data = await browseRequest({ continuation: next }).catch(() => null);
    if (data === null) break;
    const grid = parseReleaseGrid(data);
    if (grid.releases.length === 0) break;
    releases.push(...grid.releases);
    next = grid.continuation;
  }
  return releases;
}

export async function getAlbumPage(albumId: string): Promise<ReleasePage> {
  const page = parseReleasePage(await browseRequest({ browseId: albumId }), albumId);
  const more = await restOfShelf(page.continuation);
  const albumTitle = page.kind === "album" ? page.album.title : "";
  const tracks = withThumb(
    uniqueSongs([...page.tracks, ...more]).map((track) =>
      albumTitle && !track.album ? { ...track, album: albumTitle } : track,
    ),
    page.album.thumb,
  );
  return { ...page, tracks, continuation: null };
}

export async function getPlaylistPage(playlistId: string): Promise<RemotePlaylistPage & { meta: string; incomplete?: boolean }> {
  const page = parseRemotePlaylistPage(await browseRequest({ browseId: playlistBrowseId(playlistId) }));
  const more = await collectShelf(page.continuation);
  const tracks = withThumb(uniqueSongs([...page.tracks, ...more.songs]), page.thumb);
  const totalSeconds = tracks.reduce((sum, track) => sum + track.duration, 0);
  return { ...page, tracks, continuation: null, meta: playlistMeta(tracks.length, totalSeconds), ...(more.incomplete ? { incomplete: true } : {}) };
}

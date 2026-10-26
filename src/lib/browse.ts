import { getSession, MARKET, withRetry } from "./innertube";
import {
  parseArtistPage,
  parseReleasePage,
  parseRemotePlaylistPage,
  parseShelfPage,
  uniqueSongs,
  withThumb,
  type ArtistPage,
  type ReleasePage,
  type RemotePlaylistPage,
} from "./browseParse";
import { playlistMeta } from "./browseText";
import type { SearchSong } from "./searchParse";

export const MAX_SHELF_PAGES = 50;

const PLAYLIST_ID = /^(VL|PL|OLAK5uy)/;

export function playlistBrowseId(id: string): string {
  return PLAYLIST_ID.test(id) ? id : `VL${id}`;
}

async function browseRequest(payload: { browseId: string } | { continuation: string }): Promise<unknown> {
  const { innertube } = await getSession(MARKET);
  const response = await withRetry(() =>
    innertube.actions.execute("/browse", { ...payload, client: "YTMUSIC" }),
  );
  return response.data;
}

export async function restOfShelf(token: string | null): Promise<SearchSong[]> {
  const songs: SearchSong[] = [];
  let next = token;
  for (let page = 0; next !== null && page < MAX_SHELF_PAGES; page++) {
    const data = await browseRequest({ continuation: next }).catch(() => null);
    if (data === null) break;
    const shelf = parseShelfPage(data);
    if (shelf.songs.length === 0) break;
    songs.push(...shelf.songs);
    next = shelf.continuation;
  }
  return songs;
}

export async function getArtistPage(artistId: string): Promise<ArtistPage> {
  return parseArtistPage(await browseRequest({ browseId: artistId }), artistId);
}

export async function getAlbumPage(albumId: string): Promise<ReleasePage> {
  const page = parseReleasePage(await browseRequest({ browseId: albumId }), albumId);
  const more = await restOfShelf(page.continuation);
  const tracks = withThumb(uniqueSongs([...page.tracks, ...more]), page.album.thumb);
  return { ...page, tracks, continuation: null };
}

export async function getPlaylistPage(playlistId: string): Promise<RemotePlaylistPage & { meta: string }> {
  const page = parseRemotePlaylistPage(await browseRequest({ browseId: playlistBrowseId(playlistId) }));
  const more = await restOfShelf(page.continuation);
  const tracks = withThumb(uniqueSongs([...page.tracks, ...more]), page.thumb);
  return { ...page, tracks, continuation: null, meta: playlistMeta(page.year, tracks.length) };
}

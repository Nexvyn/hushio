import { getArtistBundle } from "./artistBundle";
import { getAlbumPage, getPlaylistPage } from "./browse";
import { type PlaySource, resolvePlaySource, sourceLabel } from "./playQueue";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export async function startPlaySource(source: PlaySource): Promise<void> {
  const label = sourceLabel(source);
  if (source.type !== "tracks") useUI.getState().toast(`Loading ${label}…`);
  try {
    const resolved = await resolvePlaySource(source, {
      bundle: (artistId) => getArtistBundle(artistId),
      albumTracks: (albumId) => getAlbumPage(albumId).then((page) => page.tracks),
      playlistTracks: (playlistId) => getPlaylistPage(playlistId).then((page) => page.tracks),
      now: Date.now(),
    });
    if (!resolved) {
      useUI.getState().toast(`Couldn't build "${label}" right now`, "error");
      return;
    }
    usePlayer.getState().playQueue(resolved.tracks, 0, resolved.from);
  } catch (error) {
    console.warn(`[hushio] play source failed: ${String(error)}`);
    useUI.getState().toast("Couldn't play that right now", "error");
  }
}

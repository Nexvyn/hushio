import { type LikeInput, useLibrary } from "../stores/library";

export function addSongsToPlaylists(playlistIds: readonly string[], tracks: readonly LikeInput[]): number {
  let added = 0;
  for (const playlistId of playlistIds) {
    for (const track of tracks) {
      if (useLibrary.getState().addToPlaylist(playlistId, track)) added += 1;
    }
  }
  return added;
}

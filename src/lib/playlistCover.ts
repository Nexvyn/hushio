import type { Playlist } from "../stores/library";
import { fileSrc } from "./bridge";
import { coversOf } from "./collections";

export function playlistCovers(
  playlist: Pick<Playlist, "tracks" | "coverPath">,
  limit = Number.POSITIVE_INFINITY,
  failed: Readonly<Record<string, true>> = {},
): string[] {
  if (playlist.coverPath) {
    const src = fileSrc(playlist.coverPath);
    if (!failed[src]) return [src];
  }
  return coversOf(playlist.tracks, limit);
}

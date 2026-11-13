import type { RecentItem } from "../stores/recents";
import type { Track } from "../types";

export function quickTilesFrom(recent: readonly RecentItem[], jumpBack: readonly Track[], limit: number): RecentItem[] {
  if (recent.length > 0) return recent.slice(0, limit);
  return jumpBack.slice(0, limit).map((track) => ({
    kind: "song",
    id: track.id,
    title: track.title,
    subtitle: track.artist,
    thumb: track.thumb,
  }));
}

export function sameSongRow(tiles: readonly RecentItem[], jumpBack: readonly Track[]): boolean {
  return (
    tiles.length > 0 &&
    tiles.length === jumpBack.length &&
    tiles.every((item, index) => item.kind === "song" && item.id === jumpBack[index].id)
  );
}

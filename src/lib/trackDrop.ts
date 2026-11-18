import { shortTitle } from "./browseText";
import { insertIndexAt } from "./queueInsert";
import { addSongsToPlaylists } from "./devicePlaylists";
import { type LikeInput, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export const QUEUE_TARGET = "queue";

function queueRows(): { at: number; top: number; height: number }[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-drop-target="${QUEUE_TARGET}"] [data-queue-at]`)).map(
    (row) => {
      const rect = row.getBoundingClientRect();
      return { at: Number(row.dataset.queueAt), top: rect.top, height: rect.height };
    },
  );
}

export function addTracksToQueueAt(tracks: LikeInput[], y?: number): number {
  const player = usePlayer.getState();
  const before = player.queue.length;
  if (before === 0 || y === undefined) return player.addToQueue(tracks);
  return player.addToQueue(tracks, false, insertIndexAt(y, queueRows(), before));
}

export function dropTracksOnTarget(targetId: string, tracks: LikeInput[], point?: { x: number; y: number }) {
  if (tracks.length === 0) return;
  const ui = useUI.getState();
  const single = tracks.length === 1;
  const label = single ? `“${shortTitle(tracks[0].title)}”` : `${tracks.length} songs`;
  if (targetId === QUEUE_TARGET) {
    const added = addTracksToQueueAt(tracks, point?.y);
    ui.toast(added > 0 ? `Added ${label} to queue` : "Already in your queue");
    return;
  }
  if (targetId === "liked") {
    const added = useLibrary.getState().likeMany(tracks);
    ui.toast(added > 0 ? `Added ${label} to Liked Songs` : "Already in your Liked Songs");
    return;
  }
  const playlist = useLibrary.getState().playlists.find((item) => `playlist:${item.id}` === targetId);
  if (!playlist) return;
  const added = addSongsToPlaylists([playlist.id], tracks);
  if (added > 0) {
    ui.toast(`Added ${label} to “${playlist.name}”`, "success");
    return;
  }
  ui.toast(single ? `${label} is already in “${playlist.name}”` : `Already in “${playlist.name}”`);
}

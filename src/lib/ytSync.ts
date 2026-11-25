import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { ytEnqueue, ytRate, ytUnlinkPlaylist, type YtSyncJob, type YtSyncStatus } from "./bridge";
import { LOCAL_ID_PREFIX } from "./localLibrary";
import { plural } from "./plural";
import type { LikeInput } from "../stores/library";
import type { YtRemoteVideo } from "./bridge";

const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const YT_REFRESH_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const YT_REFRESH_CONCURRENCY = 3;

export type YtPending = { add: string[]; remove: string[] };

export function videoIdOf(track: { id: string; episode?: true }): string | null {
  if (track.episode || track.id.startsWith(LOCAL_ID_PREFIX) || !YT_VIDEO_ID.test(track.id)) return null;
  return track.id;
}

export function rateYtSong(track: { id: string; episode?: true }, like: boolean): void {
  const videoId = videoIdOf(track);
  if (!videoId || !YT_VIDEO_ID.test(videoId) || useAuth.getState().account.mode !== "google") return;
  ytRate(videoId, like).catch((error: unknown) => console.warn("Couldn't save the like to YouTube.", error));
}

export function queueYtJobs(jobs: YtSyncJob[]): void {
  if (jobs.length === 0 || useAuth.getState().account.mode !== "google") return;
  ytEnqueue(jobs).catch((error: unknown) =>
    useUI.getState().toast(error instanceof Error ? error.message : String(error), "error"),
  );
}

export function unlinkYtPlaylist(localPlaylistId: string): void {
  ytUnlinkPlaylist(localPlaylistId).catch((error: unknown) =>
    useUI.getState().toast(error instanceof Error ? error.message : String(error), "error"),
  );
}

export function relativeTime(then: number, now: number): string {
  const seconds = Math.round((then - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, "second");
}

export function syncStatusText(status: YtSyncStatus, now: number): string {
  switch (status.state) {
    case "running":
      return status.total > 0 ? `Saving to YouTube: ${status.done} / ${status.total}` : "Syncing…";
    case "paused_sign_in":
      return "Sync paused. Sign in again.";
    case "error":
      return "Sync error, will retry";
    case "idle":
      return status.lastSyncedAt === null ? "Not synced yet" : `Last synced ${relativeTime(status.lastSyncedAt, now)}`;
  }
}

export function quotaText(status: YtSyncStatus): string {
  return `YouTube API units today: ${status.quotaUsedToday.toLocaleString("en-US")} of ${status.quotaLimit.toLocaleString("en-US")}. Resets at midnight Pacific.`;
}

export function failedText(count: number): string {
  return `${count} changes couldn't be saved. Sync now to try again.`;
}

export function skippedText(count: number): string | null {
  return count > 0 ? `Skipped ${plural(count, "unavailable song", "unavailable songs")}` : null;
}

export function remoteVideoTrack(video: YtRemoteVideo): LikeInput {
  return {
    id: video.videoId,
    title: video.title,
    artist: video.artist,
    thumb: video.thumbnail,
    duration: video.durationSeconds ?? 0,
  };
}

export function isYtRefreshDue(refreshedAt: number | undefined, now: number): boolean {
  return refreshedAt === undefined || now - refreshedAt >= YT_REFRESH_MAX_AGE_MS;
}

export function mergeYtRemote<T extends { id: string }>(
  local: T[],
  remote: T[],
  pending: YtPending | undefined,
): { tracks: T[]; pending: YtPending | undefined } {
  const remoteIds = new Set(remote.map((track) => track.id));
  const add = (pending?.add ?? []).filter((id) => !remoteIds.has(id));
  const remove = (pending?.remove ?? []).filter((id) => remoteIds.has(id));
  const addIds = new Set(add);
  const removeIds = new Set(remove);
  const tracks = [
    ...remote.filter((track) => !removeIds.has(track.id)),
    ...local.filter((track) => addIds.has(track.id) && !remoteIds.has(track.id)),
  ];
  return { tracks, pending: add.length > 0 || remove.length > 0 ? { add, remove } : undefined };
}

export function ytMoveJob(localPlaylistId: string, track: { id: string; episode?: true }, index: number): YtSyncJob | null {
  const videoId = videoIdOf(track);
  return videoId ? { kind: "move", localPlaylistId, videoId, payload: String(index) } : null;
}

export function queueYtMove(job: YtSyncJob | null): void {
  // The Rust sync queue has no move kind yet, so reorders stay local until it does.
  void job;
}

export async function mapLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

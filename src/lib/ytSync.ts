import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { ytEnqueue, ytRate, ytUnlinkPlaylist, type YtSyncJob, type YtSyncStatus } from "./bridge";
import { LOCAL_ID_PREFIX } from "./localLibrary";

const YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function videoIdOf(track: { id: string; episode?: true }): string | null {
  if (track.episode || track.id.startsWith(LOCAL_ID_PREFIX)) return null;
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

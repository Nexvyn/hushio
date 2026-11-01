import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { ytEnqueue, type YtSyncJob, type YtSyncStatus } from "./bridge";
import { LOCAL_ID_PREFIX } from "./localLibrary";

export function videoIdOf(track: { id: string; episode?: true }): string | null {
  if (track.episode || track.id.startsWith(LOCAL_ID_PREFIX)) return null;
  return track.id;
}

export function queueYtJobs(jobs: YtSyncJob[]): void {
  if (jobs.length === 0 || useAuth.getState().account.mode !== "google") return;
  ytEnqueue(jobs).catch((error: unknown) =>
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

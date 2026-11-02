import type { DriveSyncStatus } from "./bridge";

function clock(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function driveStatusText(status: DriveSyncStatus, signedIn: boolean): string {
  if (!signedIn) return "Not signed in";
  switch (status.state) {
    case "syncing":
      return "Syncing…";
    case "error":
      return "Sync error, will retry";
    case "pending":
      return "Pending changes";
    case "idle":
      return status.lastSyncAt === null ? "Not synced yet" : `Synced ${clock(status.lastSyncAt)}`;
  }
}

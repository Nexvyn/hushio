import { describe, expect, it } from "vitest";
import type { DriveSyncStatus } from "./bridge";
import { driveStatusText } from "./driveSync";

const base: DriveSyncStatus = { mode: "google", lastSyncAt: null, restoreSeq: 0, restoredStores: [], state: "idle", lastError: null, pending: 0 };

describe("driveStatusText", () => {
  it("prefers syncing over error over pending over idle", () => {
    expect(driveStatusText({ ...base, state: "syncing", lastError: "x", pending: 2 }, true)).toBe("Syncing…");
    expect(driveStatusText({ ...base, state: "error", lastError: "x", pending: 2 }, true)).toBe("Sync error, will retry");
    expect(driveStatusText({ ...base, state: "pending", pending: 2 }, true)).toBe("Pending changes");
  });

  it("shows the last sync time as HH:MM in local time", () => {
    expect(driveStatusText({ ...base, lastSyncAt: new Date(2026, 0, 2, 9, 7).getTime() }, true)).toBe("Synced 09:07");
    expect(driveStatusText(base, true)).toBe("Not synced yet");
  });

  it("reads Not signed in when there is no Google session", () => {
    expect(driveStatusText({ ...base, state: "pending", pending: 1 }, false)).toBe("Not signed in");
  });
});

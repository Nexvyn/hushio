import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import type { DriveSyncStatus } from "../../lib/bridge";
import { buildCategories, type BuildContext } from "./categories";
import { useSettings } from "../../stores/settings";

const IDLE_DRIVE: DriveSyncStatus = { mode: "google", lastSyncAt: null, restoreSeq: 0, restoredStores: [], state: "idle", lastError: null, pending: 0 };

function context(drive: DriveSyncStatus, mode: "guest" | "google"): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform: "windows",
    navigate: vi.fn(),
    auth: {
      account: { mode, googleSub: mode === "google" ? "sub" : null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut: vi.fn(),
    },
    sync: {
      status: { state: "idle", done: 0, total: 0, playlistName: null, backend: "official", quotaUsedToday: 0, quotaLimit: 10000, failedJobs: 0, lastError: null, lastSyncedAt: null, pulledPlaylists: 0 },
      drive,
      syncNow: vi.fn(),
      tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() },
    },
  };
}

function driveNote(ctx: BuildContext): string | undefined {
  const account = buildCategories(ctx).find((category) => category.id === "account");
  const row = account?.groups.flatMap((group) => group.rows).find((candidate) => candidate.id === "drive-sync-status");
  expect(row).toBeDefined();
  return row?.note;
}

describe("Drive sync status row", () => {
  it("moves through pending, syncing, error and back to idle", () => {
    const drives: DriveSyncStatus[] = [
      { ...IDLE_DRIVE, state: "pending", pending: 1 },
      { ...IDLE_DRIVE, state: "syncing", pending: 1 },
      { ...IDLE_DRIVE, state: "error", lastError: "Drive returned 500." },
      { ...IDLE_DRIVE, state: "idle", lastSyncAt: new Date(2026, 10, 9, 14, 5).getTime() },
    ];
    expect(drives.map((drive) => driveNote(context(drive, "google")))).toEqual([
      "Pending changes",
      "Syncing…",
      "Sync error, will retry",
      "Synced 14:05",
    ]);
  });

  it("reads Not signed in for guests", () => {
    expect(driveNote(context(IDLE_DRIVE, "guest"))).toBe("Not signed in");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DriveSyncStatus, YtPlaylistLink, YtSyncStatus, YtTvCode } from "../lib/bridge";

const hoisted = vi.hoisted(() => ({
  progress: null as ((status: YtSyncStatus) => void) | null,
  linked: null as ((link: YtPlaylistLink) => void) | null,
  tvCode: null as ((code: YtTvCode) => void) | null,
  statusNow: vi.fn(),
  syncNowCall: vi.fn(),
  linkRemote: vi.fn(),
  tvStatus: vi.fn(),
  tvConnect: vi.fn(),
  tvCancel: vi.fn(),
  tvDisconnect: vi.fn(),
  tvOpen: vi.fn(),
  setValue: vi.fn(),
  stopped: [] as string[],
  driveProgress: null as ((status: DriveSyncStatus) => void) | null,
  driveStatusNow: vi.fn(),
  driveSyncNowCall: vi.fn(),
  rehydrated: [] as string[],
}));

vi.mock("../lib/bridge", () => ({
  ytSyncStatus: hoisted.statusNow,
  ytSyncNow: hoisted.syncNowCall,
  ytTvStatus: hoisted.tvStatus,
  ytTvConnect: hoisted.tvConnect,
  ytTvCancel: hoisted.tvCancel,
  ytTvDisconnect: hoisted.tvDisconnect,
  ytTvOpen: hoisted.tvOpen,
  listenYtSyncProgress: async (onChange: (status: YtSyncStatus) => void) => {
    hoisted.progress = onChange;
    return () => hoisted.stopped.push("progress");
  },
  listenYtPlaylistLinked: async (onLink: (link: YtPlaylistLink) => void) => {
    hoisted.linked = onLink;
    return () => hoisted.stopped.push("linked");
  },
  listenYtTvCode: async (onCode: (code: YtTvCode) => void) => {
    hoisted.tvCode = onCode;
    return () => hoisted.stopped.push("tv-code");
  },
  driveSyncStatus: hoisted.driveStatusNow,
  driveSyncNow: hoisted.driveSyncNowCall,
  listenDriveSyncProgress: async (onChange: (status: DriveSyncStatus) => void) => {
    hoisted.driveProgress = onChange;
    return () => hoisted.stopped.push("drive-progress");
  },
}));

vi.mock("./library", () => ({
  useLibrary: {
    getState: () => ({ linkRemote: hoisted.linkRemote }),
    persist: { rehydrate: () => hoisted.rehydrated.push("library") },
  },
}));

vi.mock("./settings", () => ({
  useSettings: {
    getState: () => ({ setValue: hoisted.setValue }),
    persist: { rehydrate: () => hoisted.rehydrated.push("settings") },
  },
}));

vi.mock("./recents", () => ({
  useRecents: { persist: { rehydrate: () => hoisted.rehydrated.push("recent-searches") } },
}));

vi.mock("./artistMeta", () => ({
  useArtistMeta: { persist: { rehydrate: () => hoisted.rehydrated.push("artist-meta-cache") } },
}));

import { IDLE_DRIVE, IDLE_SYNC, startYtSync, useSync } from "./sync";

const running: YtSyncStatus = { ...IDLE_SYNC, state: "running", done: 1, total: 4 };
const code: YtTvCode = { userCode: "ABCD-EFGH", verificationUrl: "https://www.google.com/device", expiresAt: 0 };

beforeEach(() => {
  hoisted.statusNow.mockReset().mockResolvedValue(IDLE_SYNC);
  hoisted.syncNowCall.mockReset().mockResolvedValue(running);
  hoisted.linkRemote.mockReset();
  hoisted.tvStatus.mockReset().mockResolvedValue({ connected: false });
  hoisted.tvConnect.mockReset().mockResolvedValue({ connected: true });
  hoisted.tvCancel.mockReset().mockResolvedValue(true);
  hoisted.tvDisconnect.mockReset().mockResolvedValue({ connected: false });
  hoisted.tvOpen.mockReset().mockResolvedValue(undefined);
  hoisted.setValue.mockReset();
  hoisted.stopped.length = 0;
  hoisted.progress = null;
  hoisted.linked = null;
  hoisted.tvCode = null;
  hoisted.driveProgress = null;
  hoisted.rehydrated.length = 0;
  hoisted.driveStatusNow.mockReset().mockResolvedValue(IDLE_DRIVE);
  hoisted.driveSyncNowCall.mockReset().mockResolvedValue({ ...IDLE_DRIVE, lastSyncAt: 1 });
  useSync.setState({ status: IDLE_SYNC, drive: IDLE_DRIVE, tvConnected: false, tvCode: null, tvBusy: false, tvError: null });
});

describe("sync store", () => {
  it("stores the status returned by Sync now", async () => {
    await useSync.getState().syncNow();
    expect(hoisted.syncNowCall).toHaveBeenCalledTimes(1);
    expect(useSync.getState().status).toEqual(running);
  });

  it("loads the current status and applies progress events", async () => {
    const stop = startYtSync();
    await vi.waitFor(() => expect(hoisted.statusNow).toHaveBeenCalled());
    await vi.waitFor(() => expect(hoisted.progress).not.toBeNull());
    hoisted.progress?.({ ...IDLE_SYNC, state: "error", lastError: "boom" });
    expect(useSync.getState().status.state).toBe("error");
    stop();
    expect(hoisted.stopped).toEqual(["progress", "linked", "tv-code", "drive-progress"]);
  });

  it("links a playlist to YouTube when the sync reports it was created", async () => {
    const stop = startYtSync();
    await vi.waitFor(() => expect(hoisted.linked).not.toBeNull());
    hoisted.linked?.({ localPlaylistId: "L1", ytPlaylistId: "PLnew" });
    expect(hoisted.linkRemote).toHaveBeenCalledWith("L1", "PLnew");
    stop();
  });

  it("shows the code from the event and clears it once the connection finishes", async () => {
    const stop = startYtSync();
    await vi.waitFor(() => expect(hoisted.tvCode).not.toBeNull());
    hoisted.tvCode?.(code);
    expect(useSync.getState().tvCode).toEqual(code);
    await useSync.getState().connectTv();
    expect(useSync.getState().tvConnected).toBe(true);
    expect(useSync.getState().tvCode).toBeNull();
    expect(useSync.getState().tvBusy).toBe(false);
    stop();
  });

  it("keeps the reason when connecting fails and does not mark the account connected", async () => {
    hoisted.tvConnect.mockRejectedValueOnce(new Error("The code expired. Get a new one."));
    await useSync.getState().connectTv();
    expect(useSync.getState().tvError).toBe("The code expired. Get a new one.");
    expect(useSync.getState().tvConnected).toBe(false);
    expect(useSync.getState().tvBusy).toBe(false);
  });

  it("turns unlimited sync off when the YouTube Music connection is removed", async () => {
    useSync.setState({ tvConnected: true });
    await useSync.getState().disconnectTv();
    expect(useSync.getState().tvConnected).toBe(false);
    expect(hoisted.setValue).toHaveBeenCalledWith("unlimitedSync", false);
  });

  it("applies Drive progress and rehydrates the stores named by a restore once", async () => {
    const stop = startYtSync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    hoisted.driveProgress?.({ ...IDLE_DRIVE, state: "syncing" });
    expect(useSync.getState().drive.state).toBe("syncing");
    const restored = { ...IDLE_DRIVE, restoreSeq: 1, restoredStores: ["settings", "library", "recent-searches"] };
    hoisted.driveProgress?.(restored);
    expect(hoisted.rehydrated).toEqual(["settings", "library", "recent-searches"]);
    hoisted.driveProgress?.(restored);
    expect(hoisted.rehydrated).toHaveLength(3);
    stop();
  });

  it("stores the Drive status returned by Sync now", async () => {
    await useSync.getState().syncDriveNow();
    expect(hoisted.driveSyncNowCall).toHaveBeenCalledTimes(1);
    expect(useSync.getState().drive.lastSyncAt).toBe(1);
  });
});

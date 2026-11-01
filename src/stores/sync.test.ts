import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YtPlaylistLink, YtSyncStatus } from "../lib/bridge";

const hoisted = vi.hoisted(() => ({
  progress: null as ((status: YtSyncStatus) => void) | null,
  linked: null as ((link: YtPlaylistLink) => void) | null,
  statusNow: vi.fn(),
  syncNowCall: vi.fn(),
  linkRemote: vi.fn(),
  stopped: [] as string[],
}));

vi.mock("../lib/bridge", () => ({
  ytSyncStatus: hoisted.statusNow,
  ytSyncNow: hoisted.syncNowCall,
  listenYtSyncProgress: async (onChange: (status: YtSyncStatus) => void) => {
    hoisted.progress = onChange;
    return () => hoisted.stopped.push("progress");
  },
  listenYtPlaylistLinked: async (onLink: (link: YtPlaylistLink) => void) => {
    hoisted.linked = onLink;
    return () => hoisted.stopped.push("linked");
  },
}));

vi.mock("./library", () => ({
  useLibrary: { getState: () => ({ linkRemote: hoisted.linkRemote }) },
}));

import { IDLE_SYNC, startYtSync, useSync } from "./sync";

const running: YtSyncStatus = { ...IDLE_SYNC, state: "running", done: 1, total: 4 };

beforeEach(() => {
  hoisted.statusNow.mockReset().mockResolvedValue(IDLE_SYNC);
  hoisted.syncNowCall.mockReset().mockResolvedValue(running);
  hoisted.linkRemote.mockReset();
  hoisted.stopped.length = 0;
  hoisted.progress = null;
  hoisted.linked = null;
  useSync.setState({ status: IDLE_SYNC });
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
    expect(hoisted.stopped).toEqual(["progress", "linked"]);
  });

  it("links a playlist to YouTube when the sync reports it was created", async () => {
    const stop = startYtSync();
    await vi.waitFor(() => expect(hoisted.linked).not.toBeNull());
    hoisted.linked?.({ localPlaylistId: "L1", ytPlaylistId: "PLnew" });
    expect(hoisted.linkRemote).toHaveBeenCalledWith("L1", "PLnew");
    stop();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YtSyncStatus } from "./bridge";

const enqueue = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("./bridge", () => ({ ytEnqueue: enqueue }));

import { useAuth, GUEST_ACCOUNT } from "../stores/auth";
import { failedText, quotaText, queueYtJobs, relativeTime, syncStatusText, videoIdOf } from "./ytSync";

const status = (patch: Partial<YtSyncStatus> = {}): YtSyncStatus => ({
  state: "idle",
  done: 0,
  total: 0,
  playlistName: null,
  backend: "official",
  quotaUsedToday: 1250,
  quotaLimit: 10000,
  failedJobs: 0,
  lastError: null,
  lastSyncedAt: null,
  pulledPlaylists: 0,
  ...patch,
});

const NOW = Date.parse("2026-11-09T12:00:00Z");

beforeEach(() => {
  enqueue.mockClear();
  useAuth.setState({ account: GUEST_ACCOUNT });
});

describe("sync status text", () => {
  it("shows the PRD line for each state", () => {
    expect(syncStatusText(status(), NOW)).toBe("Not synced yet");
    expect(syncStatusText(status({ lastSyncedAt: NOW - 5 * 60_000 }), NOW)).toBe("Last synced 5 minutes ago");
    expect(syncStatusText(status({ state: "running" }), NOW)).toBe("Syncing…");
    expect(syncStatusText(status({ state: "running", done: 3, total: 9 }), NOW)).toBe("Saving to YouTube: 3 / 9");
    expect(syncStatusText(status({ state: "paused_sign_in" }), NOW)).toBe("Sync paused. Sign in again.");
    expect(syncStatusText(status({ state: "error" }), NOW)).toBe("Sync error, will retry");
  });

  it("formats the quota and failed-job lines from the PRD", () => {
    expect(quotaText(status())).toBe("YouTube API units today: 1,250 of 10,000. Resets at midnight Pacific.");
    expect(failedText(2)).toBe("2 changes couldn't be saved. Sync now to try again.");
  });

  it("picks the largest whole unit for relative times", () => {
    expect(relativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 hours ago");
    expect(relativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2 days ago");
  });
});

describe("queueYtJobs", () => {
  it("sends nothing for guest accounts", () => {
    queueYtJobs([{ kind: "create", localPlaylistId: "L1", payload: "Mix" }]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("sends the jobs once signed in to Google", () => {
    useAuth.setState({ account: { ...GUEST_ACCOUNT, mode: "google" } });
    queueYtJobs([{ kind: "add", localPlaylistId: "L1", videoId: "dQw4w9WgXcQ" }]);
    expect(enqueue).toHaveBeenCalledWith([{ kind: "add", localPlaylistId: "L1", videoId: "dQw4w9WgXcQ" }]);
  });
});

describe("videoIdOf", () => {
  it("syncs only plain video IDs, not local files or podcast episodes", () => {
    expect(videoIdOf({ id: "dQw4w9WgXcQ" })).toBe("dQw4w9WgXcQ");
    expect(videoIdOf({ id: "local:abc" })).toBeNull();
    expect(videoIdOf({ id: "ep1", episode: true })).toBeNull();
  });
});

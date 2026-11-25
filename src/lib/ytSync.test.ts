import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YtSyncStatus } from "./bridge";

const enqueue = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("./bridge", () => ({ ytEnqueue: enqueue }));

import { useAuth, GUEST_ACCOUNT } from "../stores/auth";
import {
  failedText,
  isYtRefreshDue,
  mapLimited,
  mergeYtRemote,
  quotaText,
  queueYtJobs,
  relativeTime,
  skippedText,
  syncStatusText,
  videoIdOf,
  ytMoveJob,
} from "./ytSync";

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
    expect(videoIdOf({ id: "jiosaavn:abc123" })).toBeNull();
    expect(videoIdOf({ id: "ep1", episode: true })).toBeNull();
  });
});

describe("pulling changes from YouTube", () => {
  const local = (id: string) => ({ id, title: id, artist: "A", thumb: null, duration: 1 });

  it("keeps a local add that is still queued and drops a queued remove once YouTube has it", () => {
    const merged = mergeYtRemote(
      [local("dQw4w9WgXcQ"), local("aaaaaaaaaaa")],
      [local("bbbbbbbbbbb"), local("ccccccccccc")],
      { add: ["aaaaaaaaaaa", "bbbbbbbbbbb"], remove: ["ccccccccccc", "ddddddddddd"] },
    );
    expect(merged.tracks.map((track) => track.id)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
    expect(merged.pending).toEqual({ add: ["aaaaaaaaaaa"], remove: ["ccccccccccc"] });
  });

  it("refreshes a linked playlist only after six hours", () => {
    expect(isYtRefreshDue(undefined, NOW)).toBe(true);
    expect(isYtRefreshDue(NOW - 6 * 60 * 60 * 1000 + 1, NOW)).toBe(false);
    expect(isYtRefreshDue(NOW - 6 * 60 * 60 * 1000, NOW)).toBe(true);
  });

  it("runs at most three tasks at once", async () => {
    let running = 0;
    let peak = 0;
    await mapLimited([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
    });
    expect(peak).toBe(3);
  });

  it("builds a move job only for YouTube songs and words the skipped count", () => {
    expect(ytMoveJob("local-1", { id: "dQw4w9WgXcQ" }, 2)).toEqual({
      kind: "move",
      localPlaylistId: "local-1",
      videoId: "dQw4w9WgXcQ",
      payload: "2",
    });
    expect(ytMoveJob("local-1", { id: "local:abc" }, 2)).toBeNull();
    expect(skippedText(1)).toBe("Skipped 1 unavailable song");
    expect(skippedText(3)).toBe("Skipped 3 unavailable songs");
    expect(skippedText(0)).toBeNull();
  });
});

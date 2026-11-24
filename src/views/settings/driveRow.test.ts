import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { buildCategories, type BuildContext } from "./categories";
import { INITIAL_UPDATE_STATE } from "../../lib/updates";
import { useSettings } from "../../stores/settings";

function context(mode: "guest" | "google"): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform: "windows",
    navigate: vi.fn(),
    updates: { state: INITIAL_UPDATE_STATE, check: vi.fn(), install: vi.fn(), restart: vi.fn(), openPage: vi.fn() },
    auth: {
      account: { mode, googleSub: mode === "google" ? "sub" : null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true, reconnect: false },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut: vi.fn(),
    },
    sync: {
      status: { state: "idle", done: 0, total: 0, playlistName: null, backend: "official", quotaUsedToday: 0, quotaLimit: 10000, failedJobs: 0, lastError: null, lastSyncedAt: null, pulledPlaylists: 0 },
      syncNow: vi.fn(),
      tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() },
    },
  };
}

function allText(ctx: BuildContext): string {
  return JSON.stringify(
    buildCategories(ctx).map((category) => ({
      label: category.label,
      groups: category.groups.map((group) => ({
        title: group.title,
        note: group.note,
        rows: group.rows.map(({ id, title, note }) => ({ id, title, note })),
      })),
    })),
  );
}

describe("settings without Google Drive", () => {
  it("has no Drive sync row and no Drive wording for a signed-in account", () => {
    const text = allText(context("google"));
    expect(text).not.toMatch(/drive-sync-status|Drive/);
  });

  it("has no Drive wording for a guest", () => {
    expect(allText(context("guest"))).not.toMatch(/Drive/);
  });
});

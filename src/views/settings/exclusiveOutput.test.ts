import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { buildCategories, type BuildContext, type RowSpec } from "./categories";
import { INITIAL_UPDATE_STATE } from "../../lib/updates";
import { useSettings } from "../../stores/settings";

function context(platform: BuildContext["platform"], nativeAudio?: boolean): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform,
    navigate: vi.fn(),
    nativeAudio,
    updates: { state: INITIAL_UPDATE_STATE, check: vi.fn(), install: vi.fn(), restart: vi.fn(), openPage: vi.fn() },
    auth: {
      account: { mode: "guest", googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut: vi.fn(),
    },
    sync: { status: { state: "idle" as const, done: 0, total: 0, playlistName: null, backend: "official" as const, quotaUsedToday: 0, quotaLimit: 10000, failedJobs: 0, lastError: null, lastSyncedAt: null, pulledPlaylists: 0 }, syncNow: vi.fn(), tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() } },
  };
}

function exclusiveRow(ctx: BuildContext): RowSpec | undefined {
  return buildCategories(ctx)
    .find((category) => category.id === "sound")
    ?.groups.flatMap((group) => group.rows)
    .find((row) => row.id === "exclusive-output");
}

beforeEach(() => {
  useSettings.setState({ exclusiveOutput: false });
});

afterEach(() => {
  useSettings.setState({ exclusiveOutput: false });
});

describe("Exclusive output row", () => {
  it("is shown on desktop only when native audio is available", () => {
    expect(exclusiveRow(context("windows", true))).toBeDefined();
    expect(exclusiveRow(context("linux", true))).toBeDefined();
    expect(exclusiveRow(context("macos", true))).toBeDefined();
    expect(exclusiveRow(context("windows", false))).toBeUndefined();
    expect(exclusiveRow(context("windows"))).toBeUndefined();
    expect(exclusiveRow(context("android"))).toBeUndefined();
  });

  it("starts off and writes the setting when toggled", () => {
    const row = exclusiveRow(context("windows", true));
    expect(row?.toggle?.checked).toBe(false);
    row?.toggle?.onChange(true);
    expect(useSettings.getState().exclusiveOutput).toBe(true);
    expect(exclusiveRow(context("windows", true))?.toggle?.checked).toBe(true);
  });
});

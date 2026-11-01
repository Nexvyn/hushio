import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { buildCategories, type BuildContext, type RowSpec } from "./categories";
import { useSettings } from "../../stores/settings";

const IDLE = { state: "idle" as const, done: 0, total: 0, playlistName: null, backend: "official" as const, quotaUsedToday: 0, quotaLimit: 10000, failedJobs: 0, lastError: null, lastSyncedAt: null, pulledPlaylists: 0 };

const ACCOUNT = { googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true };

function context(mode: "guest" | "google", requestSignOut = vi.fn(), syncNow = vi.fn(), state: "idle" | "running" = "idle"): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform: "windows",
    navigate: vi.fn(),
    auth: {
      account: { ...ACCOUNT, mode },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut,
    },
    sync: { status: { ...IDLE, state }, syncNow },
  };
}

function accountRows(ctx: BuildContext): RowSpec[] {
  const account = buildCategories(ctx).find((category) => category.id === "account");
  return account?.groups.flatMap((group) => group.rows) ?? [];
}

describe("account settings", () => {
  it("keeps the sign-in card as the first group body", () => {
    const account = buildCategories(context("guest")).find((category) => category.id === "account");
    expect(account?.groups[0]?.body).toBeDefined();
    expect(account?.groups[0]?.rows).toHaveLength(0);
  });

  it("disables sign out for guests", () => {
    const signOut = accountRows(context("guest")).find((row) => row.id === "sign-out");
    expect(signOut?.disabled).toBe(true);
  });

  it("enables sign out for signed-in accounts and asks for confirmation", () => {
    const requestSignOut = vi.fn();
    const signOut = accountRows(context("google", requestSignOut)).find((row) => row.id === "sign-out");
    expect(signOut?.disabled).toBeFalsy();
    const control = signOut?.control as { props: { onClick: () => void } };
    control.props.onClick();
    expect(requestSignOut).toHaveBeenCalledTimes(1);
  });

  it("enables Sync now for signed-in accounts and not while a sync runs", () => {
    const row = (ctx: BuildContext) => accountRows(ctx).find((candidate) => candidate.id === "sync-now");
    expect(row(context("google"))?.disabled).toBe(false);
    expect(row(context("guest"))?.disabled).toBe(true);
    expect(row(context("google", vi.fn(), vi.fn(), "running"))?.disabled).toBe(true);
  });

  it("keeps unlimited sync disabled until its commit", () => {
    const unlimited = accountRows(context("google")).find((row) => row.id === "unlimited-sync");
    expect(unlimited?.disabled).toBe(true);
  });
});

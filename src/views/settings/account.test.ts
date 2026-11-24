import { describe, expect, it, vi } from "vitest";

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

const IDLE = { state: "idle" as const, done: 0, total: 0, playlistName: null, backend: "official" as const, quotaUsedToday: 0, quotaLimit: 10000, failedJobs: 0, lastError: null, lastSyncedAt: null, pulledPlaylists: 0 };

const ACCOUNT = { googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true, reconnect: false };

function context(mode: "guest" | "google", requestSignOut = vi.fn(), syncNow = vi.fn(), state: "idle" | "running" = "idle"): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform: "windows",
    navigate: vi.fn(),
    updates: { state: INITIAL_UPDATE_STATE, check: vi.fn(), install: vi.fn(), restart: vi.fn(), openPage: vi.fn() },
    auth: {
      account: { ...ACCOUNT, mode },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut,
    },
    sync: {
      status: { ...IDLE, state },
      syncNow,
      tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() },
    },
  };
}

function guest(configured: boolean, signIn = vi.fn()): BuildContext {
  const base = context("guest");
  return { ...base, auth: { ...base.auth, account: { ...base.auth.account, configured }, signIn } };
}

function accountRows(ctx: BuildContext): RowSpec[] {
  const account = buildCategories(ctx).find((category) => category.id === "account");
  return account?.groups.flatMap((group) => group.rows) ?? [];
}

describe("account settings", () => {
  it("keeps the sign-in card as the first group body when signed in", () => {
    const account = buildCategories(context("google")).find((category) => category.id === "account");
    expect(account?.groups[0]?.body).toBeDefined();
    expect(account?.groups[0]?.rows).toHaveLength(0);
  });

  it("offers Sign in with Google to guests when sign-in is configured", () => {
    const signIn = vi.fn();
    const row = accountRows(guest(true, signIn)).find((candidate) => candidate.id === "sign-in");
    expect(row).toBeDefined();
    const control = row?.control as { props: { onClick: () => void } };
    control.props.onClick();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("shows a guest note without a button when sign-in is not configured", () => {
    const rows = accountRows(guest(false));
    expect(rows.some((candidate) => candidate.id === "sign-in")).toBe(false);
    const guestRow = rows.find((candidate) => candidate.id === "guest");
    expect(guestRow).toBeDefined();
    expect(guestRow?.control).toBeUndefined();
  });

  it("hides sync, unlimited sync and sign out for guests", () => {
    const ids = accountRows(guest(true)).map((row) => row.id);
    expect(ids).not.toContain("sync-now");
    expect(ids).not.toContain("unlimited-sync");
    expect(ids).not.toContain("sign-out");
  });

  it("enables sign out for signed-in accounts and asks for confirmation", () => {
    const requestSignOut = vi.fn();
    const signOut = accountRows(context("google", requestSignOut)).find((row) => row.id === "sign-out");
    expect(signOut?.disabled).toBeFalsy();
    const control = signOut?.control as { props: { onClick: () => void } };
    control.props.onClick();
    expect(requestSignOut).toHaveBeenCalledTimes(1);
  });

  it("disables Sync now only while a sync runs", () => {
    const row = (ctx: BuildContext) => accountRows(ctx).find((candidate) => candidate.id === "sync-now");
    expect(row(context("google"))?.disabled).toBe(false);
    expect(row(context("google", vi.fn(), vi.fn(), "running"))?.disabled).toBe(true);
  });

  it("enables unlimited sync for signed-in accounts", () => {
    const unlimited = (ctx: BuildContext) => accountRows(ctx).find((row) => row.id === "unlimited-sync");
    expect(unlimited(context("google"))?.disabled).toBeFalsy();
  });

  it("offers Connect YouTube account only while unlimited sync is on", () => {
    const ids = (ctx: BuildContext) => accountRows(ctx).map((row) => row.id);
    useSettings.setState({ unlimitedSync: false });
    expect(ids(context("google"))).not.toContain("tv-connect");
    useSettings.setState({ unlimitedSync: true });
    expect(ids(context("google"))).toContain("tv-connect");
    expect(ids(context("guest"))).not.toContain("tv-connect");
    useSettings.setState({ unlimitedSync: false });
  });

  it("has no import row and keeps song versions under playback", () => {
    const ids = accountRows(context("google")).map((row) => row.id);
    expect(ids).not.toContain("import-playlists");
    const everywhere = buildCategories(context("google")).flatMap((category) => category.groups.flatMap((group) => group.rows.map((row) => row.id)));
    expect(everywhere).not.toContain("import-playlists");
    const playback = buildCategories(context("google")).find((category) => category.id === "playback");
    expect(playback?.groups.flatMap((group) => group.rows.map((row) => row.id))).toContain("song-versions");
    expect(ids).not.toContain("song-versions");
  });
});

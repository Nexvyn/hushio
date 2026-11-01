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

const ACCOUNT = { googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true };

function context(mode: "guest" | "google", requestSignOut = vi.fn()): BuildContext {
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

  it("keeps sync actions disabled until the sync commits", () => {
    const sync = accountRows(context("google")).find((row) => row.id === "sync-now");
    expect(sync?.disabled).toBe(true);
  });
});

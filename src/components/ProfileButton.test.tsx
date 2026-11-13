import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));

import { profileMenuItems } from "./ProfileButton";
import { GUEST_ACCOUNT } from "../stores/auth";
import { useNavigation } from "../stores/navigation";

describe("ProfileButton menu", () => {
  it("does not repeat the theme control that the top bar already shows", () => {
    const labels = profileMenuItems(GUEST_ACCOUNT).map((entry) => entry.label);

    expect(labels).not.toContain("Theme");
    expect(labels).toContain("Account");
  });

  it("lists Settings after the account items and before sign in", () => {
    const labels = profileMenuItems(GUEST_ACCOUNT).map((entry) => entry.label);

    expect(labels.indexOf("Settings")).toBeGreaterThan(labels.indexOf("Sync status"));
    expect(labels.indexOf("Settings")).toBeLessThan(labels.indexOf("Sign in"));
  });

  it("opens the Settings view from the Settings item", () => {
    useNavigation.setState({ view: { name: "library" } });
    const item = profileMenuItems(GUEST_ACCOUNT).find((entry) => entry.label === "Settings");

    item?.onSelect?.();

    expect(useNavigation.getState().view).toEqual({ name: "settings" });
  });
});

describe("ProfileButton menu rows", () => {
  const google = { ...GUEST_ACCOUNT, mode: "google" as const, name: "Aman Gupta", email: "aman@example.com", googleSub: "sub-1", configured: true };

  it("has no separate header line", () => {
    const items = profileMenuItems(GUEST_ACCOUNT);

    expect(items.some((entry) => entry.header)).toBe(false);
    expect(items[0].label).toBe("Account");
  });

  it("shows the sign-in state on the Account row", () => {
    const guest = profileMenuItems(GUEST_ACCOUNT).find((entry) => entry.label === "Account");
    const signedIn = profileMenuItems(google).find((entry) => entry.label === "Account");

    expect(guest?.icon).toBeDefined();
    expect(guest?.trailing).toBeUndefined();
    expect(signedIn?.trailing).toBe("Aman Gupta");
  });

  it("has exactly one sign-in entry and it matches the account state", () => {
    const guestLabels = profileMenuItems(GUEST_ACCOUNT).map((entry) => entry.label);
    const signedInLabels = profileMenuItems(google).map((entry) => entry.label);

    expect(guestLabels.filter((label) => label === "Sign in")).toHaveLength(1);
    expect(guestLabels).not.toContain("Sign out");
    expect(signedInLabels.filter((label) => label.startsWith("Sign"))).toEqual(["Sign out"]);
  });

  it("opens the Recents view from the Recents item", () => {
    useNavigation.setState({ view: { name: "library" } });
    const item = profileMenuItems(GUEST_ACCOUNT).find((entry) => entry.label === "Recents");

    item?.onSelect?.();

    expect(useNavigation.getState().view).toEqual({ name: "search" });
  });

  it("gives the Sync row an icon and a single trailing state", () => {
    const sync = profileMenuItems(GUEST_ACCOUNT).find((entry) => entry.label === "Sync");

    expect(sync?.icon).toBeDefined();
    expect(sync?.note).toBeUndefined();
    expect(sync?.trailing).toBe("Off");
    expect(profileMenuItems(google).find((entry) => entry.label === "Sync")?.trailing).toBe("On");
  });
});

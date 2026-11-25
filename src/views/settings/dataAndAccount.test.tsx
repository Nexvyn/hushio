import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { buildCategories, type BuildContext, type RowSpec, type SettingsCategory } from "./categories";
import { INITIAL_UPDATE_STATE } from "../../lib/updates";
import { useSettings } from "../../stores/settings";

function context(): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform: "windows",
    navigate: vi.fn(),
    updates: { state: INITIAL_UPDATE_STATE, check: vi.fn(), install: vi.fn(), restart: vi.fn(), openPage: vi.fn() },
    auth: {
      account: { mode: "guest", googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true, reconnect: false },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut: vi.fn(),
    },
    sync: {
      status: {
        state: "idle",
        done: 0,
        total: 0,
        playlistName: null,
        backend: "official",
        quotaUsedToday: 0,
        quotaLimit: 10000,
        failedJobs: 0,
        lastError: null,
        lastSyncedAt: null,
        pulledPlaylists: 0,
      },
      syncNow: vi.fn(),
      tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() },
    },
  };
}

function category(id: SettingsCategory["id"]): SettingsCategory {
  const found = buildCategories(context()).find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`missing category ${id}`);
  return found;
}

function row(id: SettingsCategory["id"], rowId: string): RowSpec {
  const found = category(id).groups.flatMap((group) => group.rows).find((candidate) => candidate.id === rowId);
  if (found === undefined) throw new Error(`missing row ${rowId}`);
  return found;
}

describe("Account erase row", () => {
  it("is neutral: no danger title, and a right-hand button whose only red is the label", () => {
    const erase = row("account", "disconnect-erase");
    expect(erase.danger).toBeFalsy();
    render(<>{erase.control}</>);
    const button = screen.getByRole("button", { name: "Erase" });
    expect(button.className).toContain("border-separator");
    expect(button.className).toContain("text-danger-text");
    expect(button.className).toContain("h-10");
    expect(button.className).toContain("[@media(pointer:coarse)]:min-h-11");
  });
});

describe("Your data", () => {
  it("uses headings for its groups so they read differently from body text", () => {
    const groups = category("data").groups;
    expect(groups.map((group) => group.title)).toEqual(["Privacy", "Backup and reset"]);
  });

  it("keeps Reset as a neutral button on the right, without a danger title", () => {
    const reset = row("data", "reset-app-data");
    expect(reset.danger).toBeFalsy();
    render(<>{reset.control}</>);
    expect(screen.getByRole("button", { name: "Reset" }).className).toContain("text-danger-text");
  });
});

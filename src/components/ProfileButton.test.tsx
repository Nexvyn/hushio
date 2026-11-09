import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));

import { profileMenuItems } from "./ProfileButton";
import { GUEST_ACCOUNT } from "../stores/auth";
import { useSettings } from "../stores/settings";
import type { MenuItem } from "../stores/ui";

function themeItem(): MenuItem {
  const item = profileMenuItems(GUEST_ACCOUNT).find((entry) => entry.label === "Theme");
  if (!item) throw new Error("Theme item missing");
  return item;
}

describe("ProfileButton theme item", () => {
  beforeEach(() => {
    useSettings.setState({ theme: "system" });
  });

  afterEach(() => {
    useSettings.setState({ theme: "system" });
  });

  it("lists Light, Dark and System with the current mode checked", () => {
    const children = themeItem().children ?? [];

    expect(children.map((child) => child.label)).toEqual(["Light", "Dark", "System"]);
    expect(children.map((child) => child.checked)).toEqual([false, false, true]);
  });

  it("sets the theme through the settings store when a choice is picked", () => {
    const dark = (themeItem().children ?? []).find((child) => child.label === "Dark");
    dark?.onSelect?.();

    expect(useSettings.getState().theme).toBe("dark");
  });
});

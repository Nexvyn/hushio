import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  persistWrite: vi.fn(async () => true),
  persistRead: vi.fn(async () => null),
}));

import { profileMenuItems } from "./ProfileButton";
import { GUEST_ACCOUNT } from "../stores/auth";

describe("profile menu has no dev items", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows no dev item in development builds", () => {
    vi.stubEnv("DEV", true);
    const labels = profileMenuItems(GUEST_ACCOUNT).map((entry) => entry.label);
    expect(labels.filter((label) => label.startsWith("Dev"))).toEqual([]);
  });

  it("shows no dev item in production builds", () => {
    vi.stubEnv("DEV", false);
    const labels = profileMenuItems(GUEST_ACCOUNT).map((entry) => entry.label);
    expect(labels.filter((label) => label.startsWith("Dev"))).toEqual([]);
  });
});

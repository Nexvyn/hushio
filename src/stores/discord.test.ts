import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  discordStatus: vi.fn(),
  discordSetEnabled: vi.fn(),
}));

vi.mock("../lib/bridge", () => bridge);

import { useDiscord } from "./discord";
import { useUI } from "./ui";

describe("discord store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUI.setState({ toasts: [], pendingToasts: [] });
    useDiscord.setState({ status: { available: false, enabled: false, connected: false } });
  });

  it("keeps the status the backend reports", async () => {
    bridge.discordStatus.mockResolvedValue({ available: true, enabled: false, connected: true });
    await useDiscord.getState().load();
    expect(useDiscord.getState().status.connected).toBe(true);
  });

  it("keeps the last known status when the read fails", async () => {
    bridge.discordStatus.mockRejectedValue(new Error("no command"));
    await useDiscord.getState().load();
    expect(useDiscord.getState().status.available).toBe(false);
  });

  it("turns the presence on", async () => {
    bridge.discordSetEnabled.mockResolvedValue({ available: true, enabled: true, connected: false });
    await useDiscord.getState().setEnabled(true);
    expect(bridge.discordSetEnabled).toHaveBeenCalledWith(true);
    expect(useDiscord.getState().status.enabled).toBe(true);
  });

  it("shows a toast when the switch cannot be turned", async () => {
    bridge.discordSetEnabled.mockRejectedValue(new Error("nope"));
    await useDiscord.getState().setEnabled(true);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("nope");
    expect(useDiscord.getState().status.enabled).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  scrobbleStatus: vi.fn(),
  listenbrainzConnect: vi.fn(),
  listenbrainzDisconnect: vi.fn(),
  lastfmBeginAuth: vi.fn(),
  lastfmFinishAuth: vi.fn(),
  lastfmDisconnect: vi.fn(),
  scrobbleSetEnabled: vi.fn(),
}));

vi.mock("../lib/bridge", () => bridge);

import { useScrobble } from "./scrobble";
import { useUI } from "./ui";
import type { ScrobbleStatus } from "../lib/bridge";

const OFF = {
  available: false,
  connected: false,
  username: null,
  enabled: false,
  awaitingApproval: false,
};

function status(overrides: Partial<ScrobbleStatus> = {}): ScrobbleStatus {
  return {
    lastfm: { ...OFF },
    listenbrainz: { ...OFF },
    ...overrides,
  };
}

describe("scrobble store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUI.setState({ toasts: [], pendingToasts: [] });
    useScrobble.setState({ status: status(), busy: false });
  });

  it("keeps the status the backend reports", async () => {
    const next = status({ listenbrainz: { ...OFF, available: true, connected: true, username: "arya", enabled: true } });
    bridge.scrobbleStatus.mockResolvedValue(next);
    await useScrobble.getState().load();
    expect(useScrobble.getState().status.listenbrainz.username).toBe("arya");
  });

  it("keeps the last known status when the read fails", async () => {
    bridge.scrobbleStatus.mockRejectedValue(new Error("disk"));
    useScrobble.setState({ status: status({ lastfm: { ...OFF, available: true } }) });
    await useScrobble.getState().load();
    expect(useScrobble.getState().status.lastfm.available).toBe(true);
  });

  it("turns a service on or off", async () => {
    bridge.scrobbleSetEnabled.mockResolvedValue(status({ lastfm: { ...OFF, available: true, enabled: true } }));
    await useScrobble.getState().setEnabled("lastfm", true);
    expect(bridge.scrobbleSetEnabled).toHaveBeenCalledWith("lastfm", true);
    expect(useScrobble.getState().status.lastfm.enabled).toBe(true);
  });

  it("shows a toast when a service cannot be turned on", async () => {
    bridge.scrobbleSetEnabled.mockRejectedValue(new Error("nope"));
    await useScrobble.getState().setEnabled("lastfm", true);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("nope");
  });

  it("stores the ListenBrainz token through the backend only", async () => {
    bridge.listenbrainzConnect.mockResolvedValue(
      status({ listenbrainz: { ...OFF, available: true, connected: true, username: "arya", enabled: true } }),
    );
    await useScrobble.getState().connectListenbrainz("token-123");
    expect(bridge.listenbrainzConnect).toHaveBeenCalledWith("token-123");
    expect(useScrobble.getState().status.listenbrainz.connected).toBe(true);
  });

  it("starts the Last.fm sign-in without storing the key in the frontend", async () => {
    bridge.lastfmBeginAuth.mockResolvedValue(status({ lastfm: { ...OFF, available: true, awaitingApproval: true } }));
    await useScrobble.getState().beginLastfm();
    expect(bridge.lastfmBeginAuth).toHaveBeenCalled();
    expect(useScrobble.getState().status.lastfm.awaitingApproval).toBe(true);
  });

  it("clears the busy flag when a connection fails", async () => {
    bridge.listenbrainzConnect.mockRejectedValue(new Error("bad token"));
    await useScrobble.getState().connectListenbrainz("token");
    expect(useScrobble.getState().busy).toBe(false);
    expect(useUI.getState().toasts.at(-1)?.message).toBe("bad token");
  });
});

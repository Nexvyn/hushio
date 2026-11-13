import { describe, expect, it, vi } from "vitest";

import { scrobbleRows, type ScrobbleContext } from "./scrobble";

const OFF = {
  available: false,
  connected: false,
  username: null,
  enabled: false,
  awaitingApproval: false,
};

function context(overrides: Partial<ScrobbleContext> = {}): ScrobbleContext {
  return {
    status: {
      lastfm: { ...OFF },
      listenbrainz: { ...OFF },
    },
    busy: false,
    setEnabled: vi.fn(),
    connectListenbrainz: vi.fn(),
    disconnectListenbrainz: vi.fn(),
    beginLastfm: vi.fn(),
    finishLastfm: vi.fn(),
    disconnectLastfm: vi.fn(),
    ...overrides,
  };
}

function row(ctx: ScrobbleContext, id: string) {
  const found = scrobbleRows(ctx).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing row ${id}`);
  return found;
}

describe("scrobbling rows", () => {
  it("offers a connect row for each service", () => {
    const rows = scrobbleRows(context());
    expect(rows.map((item) => item.id)).toContain("lastfm-connect");
    expect(rows.map((item) => item.id)).toContain("listenbrainz-connect");
  });

  it("disables Last.fm when the build has no key", () => {
    const lastfm = row(context(), "lastfm-connect");
    expect(lastfm.disabled).toBe(true);
    expect(lastfm.note).toBe("Last.fm isn't set up in this build.");
  });

  it("enables Last.fm once a key is present", () => {
    const ctx = context();
    ctx.status.lastfm.available = true;
    expect(row(ctx, "lastfm-connect").disabled).toBe(false);
  });

  it("asks for the browser approval when a sign-in is pending", () => {
    const ctx = context();
    ctx.status.lastfm.available = true;
    ctx.status.lastfm.awaitingApproval = true;
    expect(row(ctx, "lastfm-approve").title).toBe("Last.fm");
    expect(scrobbleRows(ctx).some((item) => item.id === "lastfm-connect")).toBe(false);
  });

  it("shows the account and a switch once a service is connected", () => {
    const ctx = context();
    ctx.status.listenbrainz.connected = true;
    ctx.status.listenbrainz.username = "arya";
    ctx.status.listenbrainz.enabled = true;
    const account = row(ctx, "listenbrainz-account");
    expect(account.note).toBe("Signed in as arya");
    expect(account.value).toBe("On");
    expect(row(ctx, "listenbrainz-enabled").toggle?.checked).toBe(true);
    expect(scrobbleRows(ctx).some((item) => item.id === "listenbrainz-connect")).toBe(false);
  });

  it("turns a service on through the switch", () => {
    const ctx = context();
    ctx.status.listenbrainz.connected = true;
    row(ctx, "listenbrainz-enabled").toggle?.onChange(true);
    expect(ctx.setEnabled).toHaveBeenCalledWith("listenbrainz", true);
  });
});

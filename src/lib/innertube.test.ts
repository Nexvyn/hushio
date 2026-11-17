import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, pluginFetch, getPoToken, invalidatePoToken } = vi.hoisted(() => ({
  create: vi.fn(),
  pluginFetch: vi.fn(),
  getPoToken: vi.fn(),
  invalidatePoToken: vi.fn(),
}));

vi.mock("youtubei.js", () => ({ Innertube: { create } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
vi.mock("./poToken", () => ({ getPoToken, invalidatePoToken }));

type Innertube = typeof import("./innertube");

const market = { location: "US", lang: "en" };

function bootstrapClient(visitorData: string | undefined) {
  return { session: { context: { client: { visitorData } } } };
}

describe("innertube session", () => {
  let lib: Innertube;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./innertube");
    create.mockReset();
    create.mockImplementation(async (config: { visitor_data?: string }) =>
      config.visitor_data === undefined ? bootstrapClient("visitor-1") : { id: config.visitor_data },
    );
    pluginFetch.mockReset();
    getPoToken.mockReset();
    getPoToken.mockResolvedValue("po-token-1");
    invalidatePoToken.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("bootstraps without a player, mints a PO token, then creates the session with visitor data and the plugin fetch", async () => {
    await lib.getSession(market);

    expect(create).toHaveBeenCalledTimes(2);
    expect(getPoToken).toHaveBeenCalledWith("visitor-1");
    expect(create.mock.calls[0][0]).toEqual({
      retrieve_player: false,
      enable_session_cache: false,
      location: "US",
      lang: "en",
      fetch: expect.any(Function),
    });
    expect(create.mock.calls[1][0]).toEqual({
      retrieve_player: false,
      enable_session_cache: false,
      visitor_data: "visitor-1",
      po_token: "po-token-1",
      location: "US",
      lang: "en",
      fetch: expect.any(Function),
    });
  });

  it("creates a shared search session without playback setup", async () => {
    const [first, second] = await Promise.all([lib.getSearchSession(market), lib.getSearchSession(market)]);
    expect(first).toBe(second);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].retrieve_player).toBe(false);
    expect(getPoToken).not.toHaveBeenCalled();
  });

  it("retries search initialization after a failure", async () => {
    create.mockRejectedValueOnce(new Error("offline"));
    await expect(lib.getSearchSession(market)).rejects.toThrow("offline");
    await expect(lib.getSearchSession(market)).resolves.toMatchObject({ context: { gl: "US" } });
  });

  it("returns the session context with the minted PO token", async () => {
    await expect(lib.getSessionContext(market)).resolves.toEqual({
      visitorData: "visitor-1",
      poToken: "po-token-1",
      gl: "US",
      hl: "en",
    });
  });

  it("uses an empty visitor id when the bootstrap client has none", async () => {
    create.mockImplementation(async (config: { visitor_data?: string }) =>
      config.visitor_data === undefined ? bootstrapClient(undefined) : {},
    );

    const { context } = await lib.getSession(market);

    expect(context.visitorData).toBe("");
    expect(create).toHaveBeenCalledTimes(1);
    expect(getPoToken).not.toHaveBeenCalled();
    expect(context.poToken).toBeNull();
  });

  it("continues without a PO token when minting fails and logs the reason", async () => {
    getPoToken.mockRejectedValueOnce(new Error("botguard down"));

    const { context } = await lib.getSession(market);

    expect(context.poToken).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].po_token).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      "[hushio] PO token minting failed, continuing without: botguard down",
    );
  });

  it("reuses the bootstrap client when no PO token is available", async () => {
    getPoToken.mockRejectedValueOnce(new Error("botguard down"));

    const { innertube } = await lib.getSession(market);

    expect(create).toHaveBeenCalledTimes(1);
    expect(innertube).toMatchObject({ session: { context: { client: { visitorData: "visitor-1" } } } });
  });

  it("does not mint again when the session is rebuilt right after a mint failure", async () => {
    getPoToken.mockRejectedValueOnce(new Error("botguard down"));

    await lib.getSession(market);
    await lib.resetSession(market);

    expect(getPoToken).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("stops waiting for a slow PO token after 1500 ms and continues without it", async () => {
    vi.useFakeTimers();
    try {
      getPoToken.mockReturnValue(new Promise(() => {}));

      const pending = lib.getSession(market);
      await vi.advanceTimersByTimeAsync(1500);
      const { context } = await pending;

      expect(context.poToken).toBeNull();
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].retrieve_player).toBe(false);
      expect(console.warn).toHaveBeenCalledWith("[hushio] PO token not ready after 1500 ms, continuing without");
    } finally {
      vi.useRealTimers();
    }
  });

  it("memoizes one session across calls", async () => {
    const first = await lib.getSession(market);
    const second = await lib.getSession(market);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("shares one creation between concurrent callers", async () => {
    const [first, second] = await Promise.all([lib.getSession(market), lib.getSession(market)]);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries the whole creation when the player session fails after the PO token step", async () => {
    let failOnce = true;
    create.mockImplementation(async (config: { visitor_data?: string }) => {
      if (config.visitor_data === undefined) return bootstrapClient("visitor-1");
      if (failOnce) {
        failOnce = false;
        throw new Error("player failed");
      }
      return { id: config.visitor_data };
    });

    await expect(lib.getSession(market)).rejects.toThrow("player failed");
    await expect(lib.getSession(market)).resolves.toMatchObject({ context: { poToken: "po-token-1" } });
    expect(getPoToken).toHaveBeenCalledTimes(2);
  });

  it("clears the memo on failure so the next call retries", async () => {
    create.mockRejectedValueOnce(new Error("offline"));

    await expect(lib.getSession(market)).rejects.toThrow("offline");
    await expect(lib.getSession(market)).resolves.toMatchObject({ context: { gl: "US" } });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("resetSession builds a fresh session", async () => {
    const first = await lib.getSession(market);
    const second = await lib.resetSession(market);

    expect(second).not.toBe(first);
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("resetSession invalidates the cached PO token before minting a new one", async () => {
    await lib.getSession(market);
    await lib.resetSession(market);

    expect(invalidatePoToken).toHaveBeenCalledTimes(1);
    expect(getPoToken).toHaveBeenCalledTimes(2);
  });

  it("logs the market without any stream URL", async () => {
    await lib.getSession(market);

    expect(console.info).toHaveBeenCalledWith("[hushio] innertube session: gl=US hl=en");
  });
});

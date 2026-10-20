import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, pluginFetch } = vi.hoisted(() => ({
  create: vi.fn(),
  pluginFetch: vi.fn(),
}));

vi.mock("youtubei.js", () => ({ Innertube: { create } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));

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
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("bootstraps without a player, then creates the session with visitor data and the plugin fetch", async () => {
    await lib.getSession(market);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][0]).toEqual({
      retrieve_player: false,
      enable_session_cache: false,
      location: "US",
      lang: "en",
      fetch: pluginFetch,
    });
    expect(create.mock.calls[1][0]).toEqual({
      retrieve_player: true,
      enable_session_cache: false,
      visitor_data: "visitor-1",
      location: "US",
      lang: "en",
      fetch: pluginFetch,
    });
  });

  it("returns the session context with no PO token yet", async () => {
    await expect(lib.getSessionContext(market)).resolves.toEqual({
      visitorData: "visitor-1",
      poToken: null,
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
    expect(create.mock.calls[1][0].visitor_data).toBe("");
  });

  it("memoizes one session across calls", async () => {
    const first = await lib.getSession(market);
    const second = await lib.getSession(market);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(2);
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

  it("logs the market without any stream URL", async () => {
    await lib.getSession(market);

    expect(console.info).toHaveBeenCalledWith("[hushio] innertube session: gl=US hl=en");
  });
});

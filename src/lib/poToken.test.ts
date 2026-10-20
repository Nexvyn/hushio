import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pluginFetch, botguardCreate, minterCreate, snapshot, shutdown, mintWebsafe } = vi.hoisted(() => ({
  pluginFetch: vi.fn(),
  botguardCreate: vi.fn(),
  minterCreate: vi.fn(),
  snapshot: vi.fn(),
  shutdown: vi.fn(),
  mintWebsafe: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
vi.mock("bgutils-js/botguard", () => ({ BotGuardClient: { create: botguardCreate } }));
vi.mock("bgutils-js/webpo", () => ({ WebPoMinter: { create: minterCreate } }));

type PoToken = typeof import("./poToken");

const GENERATE_IT_URL = "https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT";
const ATT_GET_URL = "https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false";
const HOMEPAGE_URL = "https://www.youtube.com";
const TTL_MS = 3 * 60 * 60 * 1000;
const INTEGRITY = `integrity-${"x".repeat(40)}`;
const TOKEN = "PO-TOKEN-VALUE";
const DEFAULT_INTERPRETER = "globalThis.GLOBAL_NAME = {};";

function challengeHtml({ ytcfg = true, interpreter = DEFAULT_INTERPRETER }: { ytcfg?: boolean; interpreter?: string } = {}) {
  const config = ytcfg ? `<script>ytcfg.set({"INNERTUBE_API_KEY":"k"});</script>` : "";
  const challenge = {
    program: "PROGRAM",
    globalName: "GLOBAL_NAME",
    interpreterJavascript: { privateDoNotAccessOrElseSafeScriptWrappedValue: interpreter },
  };
  return `${config}<script>window.ytAtN(${JSON.stringify(challenge)});</script>`;
}

const attGetBody = {
  attestation: {
    bgChallenge: {
      program: "PROGRAM",
      globalName: "GLOBAL_NAME",
      interpreterJavascript: { privateDoNotAccessOrElseSafeScriptWrappedValue: DEFAULT_INTERPRETER },
    },
  },
};

let homepageHtml: string;
let generateItBody: unknown;
let interpreterBody: string;

function respond(url: string): Response {
  if (url === HOMEPAGE_URL) return new Response(homepageHtml);
  if (url === ATT_GET_URL) return Response.json(attGetBody);
  if (url === GENERATE_IT_URL) return Response.json(generateItBody);
  if (url.startsWith("https://www.youtube.com/s/")) return new Response(interpreterBody);
  throw new Error(`unexpected request ${url}`);
}

function requestedUrls(): string[] {
  return pluginFetch.mock.calls.map(([url]) => String(url));
}

function loggedText(): string {
  return JSON.stringify(
    ["log", "info", "warn", "error", "debug"].flatMap((method) =>
      vi.mocked(console[method as "log"]).mock.calls,
    ),
  );
}

describe("PO token minting", () => {
  let lib: PoToken;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./poToken");
    homepageHtml = challengeHtml();
    generateItBody = [INTEGRITY, 3600];
    interpreterBody = DEFAULT_INTERPRETER;
    pluginFetch.mockReset();
    pluginFetch.mockImplementation(async (url: string) => respond(url));
    botguardCreate.mockReset();
    botguardCreate.mockResolvedValue({ snapshot, shutdown });
    snapshot.mockReset();
    snapshot.mockResolvedValue("BOTGUARD-SNAPSHOT");
    shutdown.mockReset();
    shutdown.mockResolvedValue(undefined);
    minterCreate.mockReset();
    minterCreate.mockResolvedValue({ mintAsWebsafeString: mintWebsafe });
    mintWebsafe.mockReset();
    mintWebsafe.mockResolvedValue(TOKEN);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).GLOBAL_NAME;
    delete (globalThis as Record<string, unknown>).yt;
    vi.restoreAllMocks();
  });

  it("mints a token from the homepage challenge and returns it", async () => {
    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);

    expect(requestedUrls()).toEqual([HOMEPAGE_URL, GENERATE_IT_URL]);
    expect(botguardCreate).toHaveBeenCalledWith({
      program: "PROGRAM",
      globalName: "GLOBAL_NAME",
      globalObject: globalThis,
    });
    expect(snapshot).toHaveBeenCalledWith({ webPoSignalOutput: [] }, 20_000);
    expect(pluginFetch.mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify(["O43z0dpjhgX20SCx4KAo", "BOTGUARD-SNAPSHOT"]),
    });
    expect(minterCreate).toHaveBeenCalledWith(
      { integrityToken: INTEGRITY, estimatedTtlSecs: 3600, websafeFallbackToken: INTEGRITY },
      [],
    );
    expect(mintWebsafe).toHaveBeenCalledWith("visitor-1");
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("falls back to the att/get challenge when the homepage has none", async () => {
    homepageHtml = "<html></html>";

    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);

    expect(requestedUrls()).toEqual([HOMEPAGE_URL, ATT_GET_URL, GENERATE_IT_URL]);
  });

  it("reads the interpreter from its URL when no inline script is given", async () => {
    const challenge = {
      program: "PROGRAM",
      globalName: "GLOBAL_NAME",
      interpreterUrl: {
        privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: "//www.youtube.com/s/player/interp.js",
      },
    };
    homepageHtml = `<script>window.ytAtN(${JSON.stringify(challenge)});</script>`;

    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);

    expect(requestedUrls()).toContain("https://www.youtube.com/s/player/interp.js");
  });

  it("serves a cached token inside the TTL without any network call", async () => {
    await lib.getPoToken("visitor-1");
    const callsAfterMint = pluginFetch.mock.calls.length;

    vi.spyOn(Date, "now").mockReturnValue(1_000_000 + TTL_MS - 1);

    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);
    expect(pluginFetch.mock.calls.length).toBe(callsAfterMint);
  });

  it("mints again once the TTL has passed", async () => {
    await lib.getPoToken("visitor-1");

    vi.spyOn(Date, "now").mockReturnValue(1_000_000 + TTL_MS);
    await lib.getPoToken("visitor-1");

    expect(mintWebsafe).toHaveBeenCalledTimes(2);
  });

  it("mints again for different visitor data", async () => {
    await lib.getPoToken("visitor-1");
    await lib.getPoToken("visitor-2");

    expect(mintWebsafe).toHaveBeenNthCalledWith(2, "visitor-2");
    expect(mintWebsafe).toHaveBeenCalledTimes(2);
  });

  it("drops the cached token when invalidated", async () => {
    await lib.getPoToken("visitor-1");
    lib.invalidatePoToken();
    await lib.getPoToken("visitor-1");

    expect(mintWebsafe).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight mint between concurrent callers", async () => {
    const tokens = await Promise.all([
      lib.getPoToken("visitor-1"),
      lib.getPoToken("visitor-1"),
      lib.getPoToken("visitor-1"),
    ]);

    expect(tokens).toEqual([TOKEN, TOKEN, TOKEN]);
    expect(requestedUrls()).toEqual([HOMEPAGE_URL, GENERATE_IT_URL]);
    expect(mintWebsafe).toHaveBeenCalledTimes(1);
  });

  it("surfaces a clear error and does not cache a failed mint", async () => {
    homepageHtml = challengeHtml({ ytcfg: false });
    snapshot.mockRejectedValueOnce(new Error("snapshot timed out"));

    await expect(lib.getPoToken("visitor-1")).rejects.toThrow(
      "PO token minting failed: snapshot timed out",
    );
    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it("retries with att/get when a homepage mint fails and the homepage had ytcfg", async () => {
    snapshot.mockRejectedValueOnce(new Error("homepage snapshot failed"));

    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);

    expect(requestedUrls()).toEqual([HOMEPAGE_URL, ATT_GET_URL, GENERATE_IT_URL]);
    expect(console.warn).toHaveBeenCalledWith(
      "[hushio] homepage PO token mint failed, retrying with att/get: homepage snapshot failed",
    );
  });

  it("rethrows a homepage mint failure when the homepage had no ytcfg", async () => {
    homepageHtml = challengeHtml({ ytcfg: false });
    snapshot.mockRejectedValueOnce(new Error("homepage snapshot failed"));

    await expect(lib.getPoToken("visitor-1")).rejects.toThrow("homepage snapshot failed");
    expect(requestedUrls()).toEqual([HOMEPAGE_URL]);
  });

  it("continues with att/get and warns when the homepage request fails", async () => {
    pluginFetch.mockImplementation(async (url: string) => {
      if (url === HOMEPAGE_URL) throw new Error("network down");
      return respond(url);
    });

    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);

    expect(console.warn).toHaveBeenCalledWith("[hushio] homepage challenge fetch failed: network down");
    expect(requestedUrls()).toEqual([HOMEPAGE_URL, ATT_GET_URL, GENERATE_IT_URL]);
  });

  it("fails with the integrity token error when GenerateIT returns none", async () => {
    generateItBody = { error: "denied" };

    await expect(lib.getPoToken("visitor-1")).rejects.toThrow(
      'PO token minting failed: GenerateIT returned no integrity token (HTTP 200): {"error":"denied"}',
    );
  });

  it("accepts the object form of a GenerateIT response", async () => {
    generateItBody = { token: INTEGRITY, estimatedTtlSecs: 900, mintRefreshThreshold: 300 };

    await expect(lib.getPoToken("visitor-1")).resolves.toBe(TOKEN);

    expect(minterCreate).toHaveBeenCalledWith(
      {
        integrityToken: INTEGRITY,
        estimatedTtlSecs: 900,
        mintRefreshThreshold: 300,
        websafeFallbackToken: INTEGRITY,
      },
      [],
    );
  });

  it("rejects an unexpected GenerateIT response shape", async () => {
    generateItBody = "plain text";

    await expect(lib.getPoToken("visitor-1")).rejects.toThrow(
      "GenerateIT returned an unexpected response shape (HTTP 200)",
    );
  });

  it("fails when the minter returns an empty token", async () => {
    homepageHtml = challengeHtml({ ytcfg: false });
    mintWebsafe.mockResolvedValueOnce("");

    await expect(lib.getPoToken("visitor-1")).rejects.toThrow(
      "PO token minting failed: Minting returned no token",
    );
  });

  it("fails with a clear error when the interpreter does not define its global", async () => {
    homepageHtml = challengeHtml({ ytcfg: false, interpreter: "void 0;" });

    await expect(lib.getPoToken("visitor-1")).rejects.toThrow(
      "PO token minting failed: Interpreter did not define global 'GLOBAL_NAME'",
    );
  });

  it("never logs the token value on success or on failure", async () => {
    await lib.getPoToken("visitor-1");
    expect(loggedText()).not.toContain(TOKEN);

    lib.invalidatePoToken();
    homepageHtml = "<html></html>";
    generateItBody = { error: "denied" };
    pluginFetch.mockImplementation(async (url: string) => {
      if (url === HOMEPAGE_URL) throw new Error("network down");
      return respond(url);
    });
    await expect(lib.getPoToken("visitor-2")).rejects.toThrow("GenerateIT returned no integrity token");

    expect(loggedText()).not.toContain(TOKEN);
    expect(console.warn).toHaveBeenCalled();
  });
});

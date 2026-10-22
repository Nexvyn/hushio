import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pluginFetch, getBasicInfo, getSession, resetSession } = vi.hoisted(() => ({
  pluginFetch: vi.fn(),
  getBasicInfo: vi.fn(),
  getSession: vi.fn(),
  resetSession: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
vi.mock("./innertube", () => ({ getSession, resetSession }));

type ResolveStream = typeof import("./resolveStream");

type Fmt = {
  itag: number;
  url?: string;
  mime_type?: string;
  bitrate?: number;
  average_bitrate?: number;
  content_length?: number;
  has_audio: boolean;
  has_video: boolean;
  is_drc?: boolean;
  is_original?: boolean;
  loudness_db?: number;
  track_absolute_loudness_lkfs?: number;
  signature_cipher?: string;
  decipher?(player?: unknown): Promise<string>;
};

const GOOGLEVIDEO = "https://r1---sn-test.googlevideo.com/videoplayback";
const PIPED_KAVIN = "https://pipedapi.kavin.rocks";
const PIPED_ADMINFORGE = "https://pipedapi.adminforge.de";
const PIPED_PRIVATE = "https://api.piped.private.coffee";
const PLAYER = { id: "player-js" };
const CLIENT_ORDER = ["VISIONOS", "IOS", "ANDROID_VR", "WEB", "YTMUSIC", "ANDROID", "TV"];

function fmt(overrides: Partial<Fmt> & { itag: number }): Fmt {
  return {
    url: `${GOOGLEVIDEO}?itag=${overrides.itag}`,
    mime_type: 'audio/webm; codecs="opus"',
    bitrate: 130_000,
    has_audio: true,
    has_video: false,
    content_length: 1000,
    ...overrides,
  };
}

function info(adaptive: Fmt[], formats: Fmt[] = []) {
  return {
    playability_status: { status: "OK" },
    streaming_data: { adaptive_formats: adaptive, formats },
  };
}

function probeOk(): Response {
  return new Response(new Uint8Array([1, 2, 3]), { status: 206 });
}

function clientsCalled(): string[] {
  return getBasicInfo.mock.calls.map(([, options]) => (options as { client: string }).client);
}

describe("resolveStream", () => {
  let lib: ResolveStream;
  let timeouts: AbortController[];

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./resolveStream");
    timeouts = [];
    pluginFetch.mockReset();
    pluginFetch.mockImplementation(async () => probeOk());
    getBasicInfo.mockReset();
    const session = { innertube: { getBasicInfo, session: { player: PLAYER } }, context: { poToken: "po-1" } };
    getSession.mockReset();
    getSession.mockResolvedValue(session);
    resetSession.mockReset();
    resetSession.mockResolvedValue(session);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("tries the clients in PRD order, passes the PO token, and moves on after failures", async () => {
    getBasicInfo
      .mockRejectedValueOnce(new Error("visionos down"))
      .mockResolvedValueOnce(info([]))
      .mockResolvedValueOnce(info([fmt({ itag: 140, mime_type: "audio/mp4" })]));

    const result = await lib.resolveStream("dQw4w9WgXcQ");

    expect(clientsCalled()).toEqual(["VISIONOS", "IOS", "ANDROID_VR"]);
    expect(getBasicInfo.mock.calls[0][1]).toEqual({ client: "VISIONOS", po_token: "po-1" });
    expect(result).toEqual({
      url: `${GOOGLEVIDEO}?itag=140`,
      mime: "audio/mp4",
      lufs: null,
      itag: 140,
      clen: 1000,
    });
  });

  it("starts the next resolution on the client that last succeeded", async () => {
    getBasicInfo
      .mockRejectedValueOnce(new Error("visionos down"))
      .mockResolvedValue(info([fmt({ itag: 251 })]));
    await lib.resolveStream("abcdefgh");
    getBasicInfo.mockClear();

    await lib.resolveStream("abcdefgh", true);

    expect(clientsCalled()[0]).toBe("IOS");
  });

  it("skips a stream whose probe is rejected and tries the next client", async () => {
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251 })]));
    pluginFetch.mockImplementationOnce(async () => new Response(null, { status: 403 }));

    const result = await lib.resolveStream("abcdefgh");

    expect(clientsCalled()).toEqual(["VISIONOS", "IOS"]);
    expect(result.url).toBe(`${GOOGLEVIDEO}?itag=251`);
  });

  it("rebuilds the session after seven failures and starts the second round on VISIONOS", async () => {
    for (let i = 0; i < CLIENT_ORDER.length; i++) getBasicInfo.mockRejectedValueOnce(new Error("down"));
    getBasicInfo.mockResolvedValueOnce(info([fmt({ itag: 251 })]));

    await lib.resolveStream("abcdefgh");

    expect(resetSession).toHaveBeenCalledTimes(1);
    expect(clientsCalled()).toEqual([...CLIENT_ORDER, "VISIONOS"]);
  });

  it("falls back to Piped after both rounds fail and returns its audio/mp4 stream", async () => {
    getBasicInfo.mockResolvedValue(info([]));
    pluginFetch.mockImplementation(async (url: string) => {
      if (url.startsWith(PIPED_KAVIN)) {
        return Response.json({ audioStreams: [{ url: `${GOOGLEVIDEO}?piped=1`, mimeType: "audio/mp4", bitrate: 128000 }] });
      }
      return probeOk();
    });

    const result = await lib.resolveStream("abcdefgh");

    expect(getBasicInfo).toHaveBeenCalledTimes(14);
    expect(resetSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: `${GOOGLEVIDEO}?piped=1`, mime: "audio/mp4", lufs: null });
  });

  it("rethrows the last client error when Piped also fails", async () => {
    getBasicInfo.mockResolvedValue(info([]));
    pluginFetch.mockImplementation(async (url: string) =>
      url.startsWith(PIPED_KAVIN) ? new Response(null, { status: 500 }) : probeOk(),
    );

    await expect(lib.resolveStream("abcdefgh")).rejects.toThrow("no audio format for client TV");
  });

  it("returns the cached stream within its TTL without asking InnerTube again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251 })]));

    await lib.resolveStream("abcdefgh");
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 9 * 60 * 1000);
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(2);
  });

  it("expires a URL with an expire time five minutes before it lapses", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-11-01T12:00:00Z");
    vi.setSystemTime(now);
    const expire = Math.floor(now.getTime() / 1000) + 3600;
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251, url: `${GOOGLEVIDEO}?expire=${expire}` })]));

    await lib.resolveStream("abcdefgh");
    vi.setSystemTime(Date.now() + 54 * 60 * 1000);
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight resolution between concurrent callers", async () => {
    let release: (value: unknown) => void = () => {};
    getBasicInfo.mockImplementation(() => new Promise((resolve) => (release = resolve)));

    const first = lib.resolveStream("abcdefgh");
    const second = lib.resolveStream("abcdefgh");
    await vi.waitFor(() => expect(getBasicInfo).toHaveBeenCalledTimes(1));
    release(info([fmt({ itag: 251 })]));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ itag: 251 }),
      expect.objectContaining({ itag: 251 }),
    ]);
    expect(getBasicInfo).toHaveBeenCalledTimes(1);
  });

  it("refresh bypasses the cache and keeps asking for the cached itag and length", async () => {
    getBasicInfo.mockResolvedValueOnce(info([fmt({ itag: 140, content_length: 1000 })]));
    await lib.resolveStream("abcdefgh");
    getBasicInfo.mockResolvedValueOnce(
      info([fmt({ itag: 141, content_length: 2000 }), fmt({ itag: 140, content_length: 1000 })]),
    );

    const refreshed = await lib.resolveStream("abcdefgh", true);

    expect(getBasicInfo).toHaveBeenCalledTimes(2);
    expect(refreshed.itag).toBe(140);
  });

  it("caches each maxKbps and mp4Only combination separately", async () => {
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251 })]));

    await lib.resolveStream("abcdefgh");
    await lib.resolveStream("abcdefgh", false, 64);
    await lib.resolveStream("abcdefgh", false, undefined, true);

    expect(getBasicInfo).toHaveBeenCalledTimes(3);
  });

  it("caches each song id separately", async () => {
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251 })]));

    await lib.resolveStream("abcdefgh");
    await lib.resolveStream("ijklmnop");
    await lib.resolveStream("abcdefgh");

    expect(getBasicInfo).toHaveBeenCalledTimes(2);
  });

  it("refetches at the exact expiry instant, not one millisecond before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = new Date("2026-11-01T12:00:00Z").getTime();
    vi.setSystemTime(now);
    const expire = Math.floor(now / 1000) + 3600;
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251, url: `${GOOGLEVIDEO}?expire=${expire}` })]));

    await lib.resolveStream("abcdefgh");
    vi.setSystemTime(now + 55 * 60 * 1000 - 1);
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(1);

    vi.setSystemTime(now + 55 * 60 * 1000);
    await lib.resolveStream("abcdefgh");
    expect(getBasicInfo).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest cached stream once more than 500 are held", async () => {
    getBasicInfo.mockResolvedValue(info([fmt({ itag: 251 })]));

    for (let i = 0; i <= 500; i++) await lib.resolveStream(`track${i}`);
    expect(getBasicInfo).toHaveBeenCalledTimes(501);

    await lib.resolveStream("track500");
    expect(getBasicInfo).toHaveBeenCalledTimes(501);

    await lib.resolveStream("track0");
    expect(getBasicInfo).toHaveBeenCalledTimes(502);
  });

  it("logs the playability and format summary for each client", async () => {
    getBasicInfo.mockResolvedValue({
      playability_status: { status: "OK" },
      streaming_data: {
        adaptive_formats: [
          fmt({ itag: 251, url: `${GOOGLEVIDEO}?a=1` }),
          fmt({ itag: 140, url: undefined, signature_cipher: "s=1" }),
          fmt({ itag: 249, has_video: true }),
        ],
        hls_manifest_url: "https://example.test/hls.m3u8",
      },
    });

    await lib.resolveStream("abcdefgh");

    expect(console.info).toHaveBeenCalledWith(
      "[hushio] stream VISIONOS: playability=OK audio=2 plainUrl=1 sig=1 hls=y",
    );
  });

  it("aborts a probe that times out and tries the next client", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      timeouts.push(controller);
      return controller.signal;
    });
    pluginFetch.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    getBasicInfo
      .mockResolvedValueOnce(info([fmt({ itag: 140, url: `${GOOGLEVIDEO}?slow=1` })]))
      .mockResolvedValueOnce(info([fmt({ itag: 251, url: `${GOOGLEVIDEO}?fast=1` })]));

    const pending = lib.resolveStream("abcdefgh");
    await vi.waitFor(() => expect(timeouts.length).toBeGreaterThan(0));
    timeouts[0].abort();

    await expect(pending).resolves.toMatchObject({ url: `${GOOGLEVIDEO}?fast=1`, itag: 251 });
    expect(AbortSignal.timeout).toHaveBeenCalledWith(10_000);
  });
});

describe("pickAudio", () => {
  let lib: ResolveStream;
  const streaming = (adaptive: Fmt[], formats: Fmt[] = []) => ({ adaptive_formats: adaptive, formats });

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./resolveStream");
  });

  it("ranks Opus 251 above AAC 140 and AAC 141 above both", async () => {
    const picked = await lib.pickAudio(
      streaming([
        fmt({ itag: 140, mime_type: "audio/mp4", bitrate: 130_000 }),
        fmt({ itag: 251, bitrate: 160_000 }),
        fmt({ itag: 141, mime_type: "audio/mp4", bitrate: 256_000 }),
      ]),
      PLAYER,
      undefined,
      false,
    );

    expect(picked?.itag).toBe(141);
  });

  it("does not prefer the mp4 container over Opus", async () => {
    const picked = await lib.pickAudio(
      streaming([fmt({ itag: 140, mime_type: "audio/mp4" }), fmt({ itag: 251, bitrate: 160_000 })]),
      PLAYER,
      undefined,
      false,
    );

    expect(picked?.itag).toBe(251);
  });

  it("drops candidates above the bitrate ceiling, with 10 percent headroom", async () => {
    const adaptive = [
      fmt({ itag: 251, average_bitrate: 160_000 }),
      fmt({ itag: 140, average_bitrate: 130_000, mime_type: "audio/mp4" }),
      fmt({ itag: 249, average_bitrate: 50_000 }),
      fmt({ itag: 139, average_bitrate: 48_000, mime_type: "audio/mp4" }),
    ];

    const capped = await lib.pickAudio(streaming(adaptive), PLAYER, 64, false);
    const headroom = await lib.pickAudio(streaming([fmt({ itag: 140, average_bitrate: 70_000 }), fmt({ itag: 139, average_bitrate: 48_000 })]), PLAYER, 64, false);

    expect(capped?.itag).toBe(249);
    expect(headroom?.itag).toBe(140);
  });

  it("keeps every candidate when none fits the ceiling", async () => {
    const picked = await lib.pickAudio(
      streaming([fmt({ itag: 251, average_bitrate: 160_000 }), fmt({ itag: 139, average_bitrate: 48_000 })]),
      PLAYER,
      32,
      false,
    );

    expect(picked?.itag).toBe(251);
  });

  it("keeps only mp4 containers when mp4Only is set and an mp4 exists", async () => {
    const adaptive = [fmt({ itag: 251 }), fmt({ itag: 140, mime_type: "audio/mp4; codecs=\"mp4a\"" })];

    expect((await lib.pickAudio(streaming(adaptive), PLAYER, undefined, true))?.itag).toBe(140);
    expect((await lib.pickAudio(streaming(adaptive), PLAYER, undefined, false))?.itag).toBe(251);
  });

  it("returns the pinned itag and length even when a better format exists", async () => {
    const adaptive = [fmt({ itag: 251, content_length: 5000 }), fmt({ itag: 140, content_length: 1000 })];

    const picked = await lib.pickAudio(streaming(adaptive), PLAYER, 64, true, { itag: 140, clen: 1000 });

    expect(picked?.itag).toBe(140);
  });

  it("returns nothing when the pinned length no longer matches", async () => {
    const picked = await lib.pickAudio(
      streaming([fmt({ itag: 140, content_length: 1200 })]),
      PLAYER,
      undefined,
      false,
      { itag: 140, clen: 1000 },
    );

    expect(picked).toBeNull();
  });

  it("prefers the plain track over DRC and dubbed copies", async () => {
    const picked = await lib.pickAudio(
      streaming([
        fmt({ itag: 251, bitrate: 200_000, is_drc: true }),
        fmt({ itag: 140, bitrate: 130_000, mime_type: "audio/mp4" }),
        fmt({ itag: 250, bitrate: 100_000, is_original: false }),
      ]),
      PLAYER,
      undefined,
      false,
    );

    expect(picked?.itag).toBe(140);
  });

  it("reads loudness from track_absolute_loudness_lkfs, then loudness_db minus 14", async () => {
    const measured = await lib.pickAudio(
      streaming([fmt({ itag: 251, track_absolute_loudness_lkfs: -14.5, loudness_db: 2 })]),
      PLAYER,
      undefined,
      false,
    );
    const derived = await lib.pickAudio(streaming([fmt({ itag: 251, loudness_db: 2 })]), PLAYER, undefined, false);
    const none = await lib.pickAudio(streaming([fmt({ itag: 251 })]), PLAYER, undefined, false);

    expect(measured?.lufs).toBe(-14.5);
    expect(derived?.lufs).toBe(-12);
    expect(none?.lufs).toBeNull();
  });

  it("uses progressive formats when no adaptive audio exists", async () => {
    const picked = await lib.pickAudio(
      streaming([], [fmt({ itag: 140, mime_type: "audio/mp4" })]),
      PLAYER,
      undefined,
      false,
    );

    expect(picked).toMatchObject({ itag: 140, mime: "audio/mp4" });
  });

  it("returns a plain top-level URL when there are no audio formats at all", async () => {
    const picked = await lib.pickAudio({ url: "https://live.example/manifest", mime_type: "audio/mp4", formats: [], adaptive_formats: [] }, PLAYER, undefined, false);

    expect(picked).toEqual({ url: "https://live.example/manifest", mime: "audio/mp4", lufs: null });
  });

  it("deciphers a format without a plain URL using the player", async () => {
    const decipher = vi.fn(async () => `${GOOGLEVIDEO}?sig=ok`);
    const picked = await lib.pickAudio(
      streaming([fmt({ itag: 251, url: undefined, decipher })]),
      PLAYER,
      undefined,
      false,
    );

    expect(decipher).toHaveBeenCalledWith(PLAYER);
    expect(picked?.url).toBe(`${GOOGLEVIDEO}?sig=ok`);
  });

  it("returns nothing when deciphering is impossible or fails", async () => {
    const failing = fmt({ itag: 251, url: undefined, decipher: async () => { throw new Error("nsig"); } });

    expect(await lib.pickAudio(streaming([failing]), PLAYER, undefined, false)).toBeNull();
    expect(await lib.pickAudio(streaming([fmt({ itag: 251, url: undefined, decipher: async () => "x" })]), undefined, undefined, false)).toBeNull();
  });

  it("ignores formats that carry video", async () => {
    const picked = await lib.pickAudio(
      streaming([{ ...fmt({ itag: 251 }), has_video: true }]),
      PLAYER,
      undefined,
      false,
    );

    expect(picked).toBeNull();
  });

  it("returns nothing without streaming data", async () => {
    expect(await lib.pickAudio(undefined, PLAYER, undefined, false)).toBeNull();
  });

  it("ranks the whole audio ladder 141, 251, 140, 250, 249, 139 regardless of bitrate", async () => {
    const ladder = [141, 251, 140, 250, 249, 139];
    for (let i = 0; i < ladder.length - 1; i++) {
      const picked = await lib.pickAudio(
        streaming([fmt({ itag: ladder[i + 1], bitrate: 999_000 }), fmt({ itag: ladder[i], bitrate: 1 })]),
        PLAYER,
        undefined,
        false,
      );
      expect(picked?.itag).toBe(ladder[i]);
    }
  });

  it("keeps a rendition exactly at the headroom ceiling and drops one above it", async () => {
    const picked = await lib.pickAudio(
      streaming([fmt({ itag: 140, average_bitrate: 70_500 }), fmt({ itag: 139, average_bitrate: 70_400 })]),
      PLAYER,
      64,
      false,
    );

    expect(picked?.itag).toBe(139);
  });

  it("pins by itag alone when no length is pinned", async () => {
    const picked = await lib.pickAudio(
      streaming([fmt({ itag: 141, content_length: 5000 }), fmt({ itag: 251, content_length: 4000 })]),
      PLAYER,
      undefined,
      false,
      { itag: 251 },
    );

    expect(picked?.itag).toBe(251);
  });
});

describe("probeUrl", () => {
  let lib: ResolveStream;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./resolveStream");
    pluginFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a 206 or 200 response that delivers at least one byte", async () => {
    pluginFetch.mockResolvedValueOnce(probeOk());
    pluginFetch.mockResolvedValueOnce(new Response(new Uint8Array([9]), { status: 200 }));

    await expect(lib.probeUrl(GOOGLEVIDEO)).resolves.toBe(true);
    await expect(lib.probeUrl(GOOGLEVIDEO)).resolves.toBe(true);
  });

  it("sends an open range request with a 10 second timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    pluginFetch.mockResolvedValueOnce(probeOk());

    await lib.probeUrl(GOOGLEVIDEO);

    expect(pluginFetch).toHaveBeenCalledWith(
      GOOGLEVIDEO,
      expect.objectContaining({ headers: expect.objectContaining({ Range: "bytes=0-" }) }),
    );
    expect(timeout).toHaveBeenCalledWith(10_000);
  });

  it("rejects other status codes", async () => {
    pluginFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    pluginFetch.mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(lib.probeUrl(GOOGLEVIDEO)).resolves.toBe(false);
    await expect(lib.probeUrl(GOOGLEVIDEO)).resolves.toBe(false);
  });

  it("rejects an empty body", async () => {
    pluginFetch.mockResolvedValueOnce(new Response(new Uint8Array(0), { status: 206 }));

    await expect(lib.probeUrl(GOOGLEVIDEO)).resolves.toBe(false);
  });

  it("rejects when the request throws", async () => {
    pluginFetch.mockRejectedValueOnce(new Error("network"));

    await expect(lib.probeUrl(GOOGLEVIDEO)).resolves.toBe(false);
  });

  it("rejects when the request is aborted by the timeout", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(controller.signal);
    pluginFetch.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const probe = lib.probeUrl(GOOGLEVIDEO);
    controller.abort();

    await expect(probe).resolves.toBe(false);
  });
});

describe("streamTtlMs", () => {
  let lib: ResolveStream;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./resolveStream");
  });

  it("uses ten minutes when the URL has no expire time", () => {
    expect(lib.streamTtlMs(`${GOOGLEVIDEO}?itag=251`, 0)).toBe(600_000);
  });

  it("ends five minutes before the expire time", () => {
    const now = 1_000_000_000_000;
    const expire = Math.floor(now / 1000) + 3600;

    expect(lib.streamTtlMs(`${GOOGLEVIDEO}?expire=${expire}`, now)).toBe(55 * 60 * 1000);
  });

  it("caps the lifetime at six hours and never goes negative", () => {
    const now = 1_000_000_000_000;

    expect(lib.streamTtlMs(`${GOOGLEVIDEO}?expire=9999999999`, now)).toBe(6 * 60 * 60 * 1000);
    expect(lib.streamTtlMs(`${GOOGLEVIDEO}?expire=1000000001`, now)).toBe(0);
  });

  it("reads expire from a path segment as well as a query", () => {
    const now = 1_000_000_000_000;
    const expire = Math.floor(now / 1000) + 3600;

    expect(lib.streamTtlMs(`${GOOGLEVIDEO}/expire/${expire}/x`, now)).toBe(55 * 60 * 1000);
  });
});

describe("resolveViaPiped", () => {
  let lib: ResolveStream;
  let timeouts: AbortController[];

  const mirrorStreams = (streams: { url: string; mimeType?: string; bitrate?: number }[]) =>
    Response.json({ audioStreams: streams });

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./resolveStream");
    timeouts = [];
    pluginFetch.mockReset();
    pluginFetch.mockImplementation(async () => probeOk());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a malformed video id without any request", async () => {
    await expect(lib.resolveViaPiped("bad id!")).rejects.toThrow("Invalid video id");
    expect(pluginFetch).not.toHaveBeenCalled();
  });

  it("queries the mirrors in order and moves on from a failing one", async () => {
    pluginFetch.mockImplementation(async (url: string) => {
      if (url.startsWith(PIPED_KAVIN)) return new Response(null, { status: 500 });
      return mirrorStreams([{ url: `${GOOGLEVIDEO}?ok=1`, mimeType: "audio/mp4", bitrate: 128000 }]);
    });

    const result = await lib.resolveViaPiped("abcdefgh");

    expect(pluginFetch.mock.calls.map(([url]) => url)).toEqual([
      `${PIPED_KAVIN}/streams/abcdefgh`,
      `${PIPED_ADMINFORGE}/streams/abcdefgh`,
      `${GOOGLEVIDEO}?ok=1`,
    ]);
    expect(result).toEqual({ url: `${GOOGLEVIDEO}?ok=1`, mime: "audio/mp4", lufs: null });
  });

  it("prefers the highest mp4 or AAC stream over a higher-bitrate Opus stream", async () => {
    pluginFetch.mockImplementation(async (url: string) => {
      if (url.startsWith(PIPED_KAVIN)) {
        return mirrorStreams([
          { url: `${GOOGLEVIDEO}?opus`, mimeType: "audio/webm", bitrate: 160_000 },
          { url: `${GOOGLEVIDEO}?aac`, mimeType: "audio/mp4", bitrate: 128_000 },
          { url: `${GOOGLEVIDEO}?aac-low`, mimeType: "audio/mp4", bitrate: 64_000 },
        ]);
      }
      return probeOk();
    });

    const result = await lib.resolveViaPiped("abcdefgh");

    expect(result.url).toBe(`${GOOGLEVIDEO}?aac`);
  });

  it("moves to the next mirror when the chosen stream fails the probe", async () => {
    pluginFetch.mockImplementation(async (url: string) => {
      if (url === `${PIPED_KAVIN}/streams/abcdefgh`) {
        return mirrorStreams([{ url: `${GOOGLEVIDEO}?dead`, mimeType: "audio/mp4" }]);
      }
      if (url.startsWith(GOOGLEVIDEO) && url.includes("dead")) return new Response(null, { status: 403 });
      if (url === `${PIPED_ADMINFORGE}/streams/abcdefgh`) {
        return mirrorStreams([{ url: `${GOOGLEVIDEO}?live`, mimeType: "audio/mp4" }]);
      }
      return probeOk();
    });

    await expect(lib.resolveViaPiped("abcdefgh")).resolves.toMatchObject({ url: `${GOOGLEVIDEO}?live` });
  });

  it("aborts a hanging mirror after 12 seconds and moves on", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      timeouts.push(controller);
      return controller.signal;
    });
    pluginFetch.mockImplementationOnce(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("timed out")));
        }),
    );
    pluginFetch.mockImplementationOnce(async () =>
      mirrorStreams([{ url: `${GOOGLEVIDEO}?second`, mimeType: "audio/mp4" }]),
    );

    const pending = lib.resolveViaPiped("abcdefgh");
    await vi.waitFor(() => expect(timeouts.length).toBeGreaterThan(0));
    timeouts[0].abort();

    await expect(pending).resolves.toMatchObject({ url: `${GOOGLEVIDEO}?second` });
    expect(AbortSignal.timeout).toHaveBeenCalledWith(12_000);
  });

  it("fails with the Piped message when every mirror fails", async () => {
    pluginFetch.mockImplementation(async () => new Response(null, { status: 500 }));

    await expect(lib.resolveViaPiped("abcdefgh")).rejects.toThrow("No Piped mirror had a playable stream");
    expect(pluginFetch).toHaveBeenCalledTimes(3);
    expect(pluginFetch.mock.calls.map(([url]) => url)).toContain(`${PIPED_PRIVATE}/streams/abcdefgh`);
  });
});

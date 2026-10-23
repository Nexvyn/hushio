import { beforeEach, describe, expect, it, vi } from "vitest";

const { create, execute, pluginFetch, getPoToken, invalidatePoToken } = vi.hoisted(() => ({
  create: vi.fn(),
  execute: vi.fn(),
  pluginFetch: vi.fn(),
  getPoToken: vi.fn(),
  invalidatePoToken: vi.fn(),
}));

vi.mock("youtubei.js", () => ({ Innertube: { create } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
vi.mock("./poToken", () => ({ getPoToken, invalidatePoToken }));

type Lib = typeof import("./innertube");

type RowOptions = {
  videoId: string;
  title?: string;
  artist?: string;
  artistId?: string;
  length?: string;
  musicVideoType?: string;
  thumbSquare?: boolean;
  selected?: boolean;
  unplayable?: string;
  explicit?: boolean;
};

function row({
  videoId,
  title = `Title ${videoId}`,
  artist = "Artist",
  artistId = "UCartist",
  length = "3:30",
  musicVideoType,
  thumbSquare = true,
  selected,
  unplayable,
  explicit = false,
}: RowOptions) {
  return {
    videoId,
    title: { runs: [{ text: title }] },
    selected,
    unplayableText: unplayable,
    longBylineText: {
      runs: [
        { text: artist, navigationEndpoint: { browseEndpoint: { browseId: artistId } } },
        { text: " • " },
        { text: "Album" },
      ],
    },
    lengthText: { runs: [{ text: length }] },
    thumbnail: {
      thumbnails: [
        { url: "https://i.ytimg.com/small.jpg", width: 60, height: 60 },
        thumbSquare
          ? { url: `https://i.ytimg.com/${videoId}.jpg`, width: 544, height: 544 }
          : { url: `https://i.ytimg.com/${videoId}.jpg`, width: 544, height: 306 },
      ],
    },
    badges: explicit ? [{ musicInlineBadgeRenderer: { icon: { iconType: "MUSIC_EXPLICIT_BADGE" } } }] : [],
    navigationEndpoint: {
      watchEndpoint: {
        videoId,
        watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType } },
      },
    },
  };
}

const wrap = (primary: ReturnType<typeof row>, counterpart: ReturnType<typeof row>[] = []) => ({
  playlistPanelVideoWrapperRenderer: {
    primaryRenderer: { playlistPanelVideoRenderer: primary },
    counterpart: counterpart.map((side) => ({ counterpartRenderer: { playlistPanelVideoRenderer: side } })),
  },
});

function panelResponse(entries: unknown[], continuation?: unknown) {
  return {
    contents: [
      {
        tabRenderer: {
          content: {
            playlistPanelRenderer: {
              contents: entries,
              continuations: continuation === undefined ? [] : [continuation],
            },
          },
        },
      },
    ],
  };
}

describe("parseRadioPage", () => {
  let lib: Lib;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./innertube");
  });

  it("returns the radio songs in order and leaves the seed out", () => {
    const data = panelResponse(
      [
        wrap(row({ videoId: "seed-1", selected: true, artist: "Seed Artist", artistId: "UCseed" })),
        wrap(row({ videoId: "a", musicVideoType: "MUSIC_VIDEO_TYPE_ATV", length: "1:05:02" })),
        wrap(row({ videoId: "b", musicVideoType: "MUSIC_VIDEO_TYPE_ATV", explicit: true })),
      ],
      { nextRadioContinuationData: { continuation: "next-token" } },
    );

    const page = lib.parseRadioPage(data, "seed-1");

    expect(page?.seed).toEqual({ artist: "Seed Artist", artistId: "UCseed" });
    expect(page?.continuation).toBe("next-token");
    expect(page?.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(page?.items[0]).toMatchObject({ duration: 3902, videoType: "song", artistId: "UCartist", thumb: "https://i.ytimg.com/a.jpg" });
    expect(page?.items[1]).toMatchObject({ explicit: true });
  });

  it("matches the seed by id when no row is selected", () => {
    const data = panelResponse([wrap(row({ videoId: "seed-2", artist: "Me" })), wrap(row({ videoId: "x" }))]);
    const page = lib.parseRadioPage(data, "seed-2");
    expect(page?.seed?.artist).toBe("Me");
    expect(page?.items.map((item) => item.id)).toEqual(["x"]);
  });

  it("prefers the counterpart that is a song over a primary video", () => {
    const primary = row({ videoId: "clip", thumbSquare: false });
    const song = row({ videoId: "track", musicVideoType: "MUSIC_VIDEO_TYPE_ATV" });
    const page = lib.parseRadioPage(panelResponse([wrap(primary, [song])]), "other");
    expect(page?.items).toHaveLength(1);
    expect(page?.items[0]).toMatchObject({ id: "track", videoType: "song" });
  });

  it("falls back to the first side when no side is a song", () => {
    const primary = row({ videoId: "clip", thumbSquare: false });
    const other = row({ videoId: "other-clip", musicVideoType: "MUSIC_VIDEO_TYPE_UGC" });
    const page = lib.parseRadioPage(panelResponse([wrap(primary, [other])]), "seed");
    expect(page?.items[0]).toMatchObject({ id: "clip", videoType: "video" });
  });

  it("skips a wrapper whose chosen side is unplayable", () => {
    const data = panelResponse([wrap(row({ videoId: "gone", unplayable: "Not available" })), wrap(row({ videoId: "ok" }))]);
    expect(lib.parseRadioPage(data, "seed")?.items.map((item) => item.id)).toEqual(["ok"]);
  });

  it("skips a wrapper with no row", () => {
    const data = panelResponse([{ playlistPanelVideoWrapperRenderer: { counterpart: [] } }, wrap(row({ videoId: "ok" }))]);
    expect(lib.parseRadioPage(data, "seed")?.items.map((item) => item.id)).toEqual(["ok"]);
  });

  it("reads a continuation panel and its next continuation token", () => {
    const data = {
      continuationContents: {
        playlistPanelContinuation: {
          contents: [wrap(row({ videoId: "later", musicVideoType: "MUSIC_VIDEO_TYPE_ATV" }))],
          continuations: [{ nextContinuationData: { continuation: "after-that" } }],
        },
      },
    };
    const page = lib.parseRadioPage(data, "seed");
    expect(page?.items.map((item) => item.id)).toEqual(["later"]);
    expect(page?.continuation).toBe("after-that");
    expect(page?.seed).toBeNull();
  });

  it("uses the artist name from credits when the byline has no artist", () => {
    const bare = { ...row({ videoId: "credit" }), longBylineText: { runs: [] }, credits: { artistName: "Credited" } };
    const unknown = { ...row({ videoId: "nobody" }), longBylineText: { runs: [] } };
    const page = lib.parseRadioPage(panelResponse([wrap(bare), wrap(unknown)]), "seed");
    expect(page?.items.map((item) => item.artist)).toEqual(["Credited", "Unknown artist"]);
  });

  it("returns null when the response has no panel", () => {
    expect(lib.parseRadioPage({ contents: [] }, "seed")).toBeNull();
  });
});

describe("radioVideoType", () => {
  let lib: Lib;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./innertube");
  });

  const typed = (musicVideoType: string) => lib.radioVideoType(row({ videoId: "x", musicVideoType }));

  it("maps the music video type to a track kind", () => {
    expect(typed("MUSIC_VIDEO_TYPE_ATV")).toBe("song");
    expect(typed("MUSIC_VIDEO_TYPE_UGC")).toBe("upload");
    expect(typed("MUSIC_VIDEO_TYPE_PODCAST_EPISODE")).toBe("episode");
    expect(typed("MUSIC_VIDEO_TYPE_OMV")).toBe("video");
  });

  it("uses the thumbnail shape when the type is absent", () => {
    expect(lib.radioVideoType(row({ videoId: "x", thumbSquare: true }))).toBe("song");
    expect(lib.radioVideoType(row({ videoId: "x", thumbSquare: false }))).toBe("video");
  });
});

describe("parseDuration", () => {
  let lib: Lib;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./innertube");
  });

  it("reads m:ss and h:mm:ss and rejects anything else", () => {
    expect(lib.parseDuration("3:30")).toBe(210);
    expect(lib.parseDuration("1:02:03")).toBe(3723);
    expect(lib.parseDuration("12")).toBe(0);
    expect(lib.parseDuration("")).toBe(0);
  });
});

describe("getRadio", () => {
  let lib: Lib;

  beforeEach(async () => {
    vi.resetModules();
    lib = await import("./innertube");
    create.mockReset();
    create.mockImplementation(async (config: { visitor_data?: string }) =>
      config.visitor_data === undefined
        ? { session: { context: { client: { visitorData: "visitor" } } } }
        : { actions: { execute } },
    );
    execute.mockReset();
    getPoToken.mockReset();
    getPoToken.mockResolvedValue("po");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("posts the radio body to next with the RDAMVM playlist and the YTMUSIC client", async () => {
    execute.mockResolvedValue({ data: panelResponse([wrap(row({ videoId: "a" }))]) });

    const page = await lib.getRadio("seedvideo01");

    expect(execute).toHaveBeenCalledWith("/next", {
      videoId: "seedvideo01",
      playlistId: "RDAMVMseedvideo01",
      enablePersistentPlaylistPanel: true,
      tunerSettingValue: "AUTOMIX_SETTING_NORMAL",
      watchEndpointMusicSupportedConfigs: {
        watchEndpointMusicConfig: { hasPersistentPlaylistPanel: true, musicVideoType: "MUSIC_VIDEO_TYPE_ATV" },
      },
      client: "YTMUSIC",
    });
    expect(page?.items.map((item) => item.id)).toEqual(["a"]);
  });

  it("sends the continuation only on later pages", async () => {
    execute.mockResolvedValue({ data: panelResponse([]) });

    await lib.getRadio("seedvideo01", "page-2");

    expect(execute.mock.calls[0][1]).toMatchObject({ continuation: "page-2", client: "YTMUSIC" });
  });

  it("retries once after a failure and returns the second answer", async () => {
    vi.useFakeTimers();
    try {
      execute
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({ data: panelResponse([wrap(row({ videoId: "b" }))]) });

      const pending = lib.getRadio("seedvideo01");
      await vi.runAllTimersAsync();
      const page = await pending;

      expect(execute).toHaveBeenCalledTimes(2);
      expect(page?.items.map((item) => item.id)).toEqual(["b"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rethrows when the retry also fails", async () => {
    vi.useFakeTimers();
    try {
      execute.mockRejectedValue(new Error("offline"));

      const pending = expect(lib.getRadio("seedvideo01")).rejects.toThrow("offline");
      await vi.runAllTimersAsync();

      await pending;
      expect(execute).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

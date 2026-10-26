import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, getSession } = vi.hoisted(() => {
  const execute = vi.fn();
  return { execute, getSession: vi.fn(async () => ({ innertube: { actions: { execute } } })) };
});

vi.mock("youtubei.js", () => ({ Innertube: { create: vi.fn() } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("./innertube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./innertube")>()),
  getSession,
  withRetry: async <T>(run: () => Promise<T>) => run(),
}));

vi.mock("./market", () => ({ marketValue: () => ({ location: "US", lang: "en" }) }));

type Podcasts = typeof import("./podcasts");

const runs = (value: string) => ({ runs: [{ text: value }] });
const ART = "https://lh3.googleusercontent.com/a=s60";

function show(id: string, title: string) {
  return {
    musicTwoRowItemRenderer: {
      title: runs(title),
      subtitle: runs("Host"),
      navigationEndpoint: { browseEndpoint: { browseId: id } },
      thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: ART }] } } },
    },
  };
}

function episode(id: string) {
  return {
    musicMultiRowListItemRenderer: {
      onTap: { watchEndpoint: { videoId: id } },
      title: runs(`Episode ${id}`),
      subtitle: runs("Host • 5 min"),
      thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: ART }] } } },
    },
  };
}

function episodes(from: number, to: number) {
  return Array.from({ length: to - from }, (_, index) => episode(`e${from + index}`));
}

function shelfPage(...shows: ReturnType<typeof show>[]) {
  return {
    contents: [
      { musicCarouselShelfRenderer: { header: { musicCarouselShelfBasicHeaderRenderer: { title: runs("Shows") } }, contents: shows } },
    ],
  };
}

function showPage(items: unknown[], token: string | null) {
  return {
    header: { musicResponsiveHeaderRenderer: { title: runs("Show A"), subtitle: runs("Host") } },
    sections: [
      {
        musicShelfRenderer: {
          contents: items,
          ...(token === null ? {} : { continuations: [{ nextContinuationData: { continuation: token } }] }),
        },
      },
    ],
  };
}

function continuationPage(items: unknown[], token: string | null) {
  return {
    continuationContents: {
      musicShelfContinuation: {
        contents: items,
        ...(token === null ? {} : { continuations: [{ nextContinuationData: { continuation: token } }] }),
      },
    },
  };
}

let podcasts: Podcasts;
let clock: number;

beforeEach(async () => {
  vi.resetModules();
  execute.mockReset();
  getSession.mockClear();
  podcasts = await import("./podcasts");
  clock = 1_000_000_000;
});

describe("loadPodcasts", () => {
  it("browses the podcasts page once and serves the cache for an hour", async () => {
    execute.mockResolvedValue({ data: shelfPage(show("MPSPa", "Show A")) });

    const first = await podcasts.loadPodcasts(clock);
    const again = await podcasts.loadPodcasts(clock + podcasts.PODCASTS_TTL_MS - 1);

    expect(first).toEqual(again);
    expect(first[0].shows.map((item) => item.id)).toEqual(["MPSPa"]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("/browse", { browseId: "FEmusic_non_music_audio", client: "YTMUSIC" });
  });

  it("browses again once the cache is an hour old", async () => {
    execute.mockResolvedValue({ data: shelfPage(show("MPSPa", "Show A")) });
    await podcasts.loadPodcasts(clock);
    await podcasts.loadPodcasts(clock + podcasts.PODCASTS_TTL_MS);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("returns an empty list when the first load fails and nothing is cached", async () => {
    execute.mockRejectedValue(new Error("offline"));
    await expect(podcasts.loadPodcasts(clock)).resolves.toEqual([]);
  });

  it("returns the stale cached shelves when a later refresh fails", async () => {
    execute.mockResolvedValueOnce({ data: shelfPage(show("MPSPa", "Show A")) });
    const cached = await podcasts.loadPodcasts(clock);

    execute.mockRejectedValueOnce(new Error("offline"));
    const stale = await podcasts.loadPodcasts(clock + podcasts.PODCASTS_TTL_MS + 1);

    expect(stale).toEqual(cached);
  });

  it("does not cache an empty result", async () => {
    execute.mockResolvedValue({ data: { contents: [] } });
    await podcasts.loadPodcasts(clock);
    expect(podcasts.freshPodcasts(clock)).toBeNull();
  });
});

describe("getPodcast", () => {
  it("fetches the show, then follows at most four continuation pages", async () => {
    execute
      .mockResolvedValueOnce({ data: showPage(episodes(0, 1), "C1") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(1, 2), "C2") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(2, 3), "C3") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(3, 4), "C4") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(4, 5), "C5") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(5, 6), "C6") });

    const page = await podcasts.getPodcast("MPSPa");

    expect(page.episodes.map((item) => item.id)).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(execute).toHaveBeenCalledTimes(1 + podcasts.PODCAST_EXTRA_PAGES);
    expect(execute).toHaveBeenLastCalledWith("/browse", { continuation: "C4", client: "YTMUSIC" });
  });

  it("stops when a continuation page adds nothing new", async () => {
    execute
      .mockResolvedValueOnce({ data: showPage(episodes(0, 2), "C1") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(1, 2), "C2") });

    const page = await podcasts.getPodcast("MPSPa");

    expect(page.episodes.map((item) => item.id)).toEqual(["e0", "e1"]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("caps the list at 100 episodes", async () => {
    execute
      .mockResolvedValueOnce({ data: showPage(episodes(0, 60), "C1") })
      .mockResolvedValueOnce({ data: continuationPage(episodes(60, 120), null) });

    const page = await podcasts.getPodcast("MPSPa");

    expect(page.episodes).toHaveLength(podcasts.PODCAST_EPISODES_MAX);
    expect(page.episodes.at(-1)?.id).toBe("e99");
  });

  it("keeps the episodes already loaded when a continuation fails", async () => {
    execute
      .mockResolvedValueOnce({ data: showPage(episodes(0, 2), "C1") })
      .mockRejectedValueOnce(new Error("network"));

    const page = await podcasts.getPodcast("MPSPa");

    expect(page.episodes.map((item) => item.id)).toEqual(["e0", "e1"]);
    expect(page.title).toBe("Show A");
  });

  it("rejects when the show itself cannot be fetched", async () => {
    execute.mockRejectedValue(new Error("offline"));
    await expect(podcasts.getPodcast("MPSPa")).rejects.toThrow("offline");
  });
});

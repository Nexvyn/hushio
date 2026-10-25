import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execute, getSession } = vi.hoisted(() => {
  const execute = vi.fn();
  return { execute, getSession: vi.fn(async () => ({ innertube: { actions: { execute } } })) };
});

vi.mock("youtubei.js", () => ({ Innertube: { create: vi.fn() } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("./innertube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./innertube")>()),
  getSession,
}));

import {
  cachedSearchPage,
  clearSearchCaches,
  createTtlCache,
  getSuggestions,
  peekSearchPage,
  peekTypeAhead,
  searchMore,
  searchPage,
  typeAhead,
} from "./search";

const ART = "https://i.ytimg.com/vi/abc/hqdefault.jpg";

function songRow(id: string, title: string) {
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Song • Dua Lipa" }] } } },
      ],
      thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: ART, width: 544, height: 544 }] } } },
    },
  };
}

function page(id: string, token: string | null = null) {
  const contents: unknown[] = [songRow(id, `Song ${id}`)];
  if (token) contents.push({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
  return { data: { contents } };
}

function suggestionPage(text: string) {
  return { data: { contents: [{ searchSuggestionRenderer: { suggestion: { runs: [{ text }] } } }, songRow("s1", text)] } };
}

beforeEach(() => {
  vi.useFakeTimers();
  execute.mockReset();
  getSession.mockClear();
  clearSearchCaches();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTtlCache", () => {
  it("returns a value until its time to live passes", () => {
    let now = 0;
    const cache = createTtlCache<string>(1000, 5, () => now);
    cache.set("a", "one");

    now = 999;
    expect(cache.get("a")).toBe("one");
    now = 1000;
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the oldest entry past the limit and keeps refreshed entries", () => {
    const cache = createTtlCache<number>(60_000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 3);
    cache.set("c", 4);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(3);
    expect(cache.get("c")).toBe(4);
  });
});

describe("searchPage", () => {
  it("returns nothing without a network call for an empty query", async () => {
    await expect(searchPage("   ", "all")).resolves.toEqual({ rows: [], continuation: null });
    expect(getSession).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("omits the filter params on All and sends the songs params on Songs", async () => {
    execute.mockResolvedValue(page("a"));

    await searchPage("  dua  ", "all");
    expect(execute).toHaveBeenLastCalledWith("/search", { query: "dua", client: "YTMUSIC" });

    await searchPage("dua", "songs");
    expect(execute).toHaveBeenLastCalledWith("/search", {
      query: "dua",
      params: "EgWKAQIIAWoKEAkQChAFEAMQBA==",
      client: "YTMUSIC",
    });
  });

  it("retries once after a failure", async () => {
    execute.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(page("a"));

    const pending = searchPage("dua", "all");
    await vi.advanceTimersByTimeAsync(600);

    await expect(pending).resolves.toMatchObject({ rows: [{ kind: "track", track: { id: "a" } }] });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("passes the continuation token through searchMore", async () => {
    execute.mockResolvedValue(page("b", "NEXT"));

    const result = await searchMore("TOKEN", "videos");

    expect(execute).toHaveBeenCalledWith("/search", { continuation: "TOKEN", client: "YTMUSIC" });
    expect(result.continuation).toBe("NEXT");
  });
});

describe("cachedSearchPage", () => {
  it("serves repeats of the same query and filter from the one-minute cache", async () => {
    execute.mockResolvedValue(page("a"));

    await cachedSearchPage("Dua", "all");
    await cachedSearchPage("  dua ", "all");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(peekSearchPage("dua", "all")).toBeDefined();
  });

  it("keeps filters apart and fetches again after a minute", async () => {
    execute.mockResolvedValue(page("a"));

    await cachedSearchPage("dua", "all");
    await cachedSearchPage("dua", "songs");
    expect(execute).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(peekSearchPage("dua", "all")).toBeUndefined();
    await cachedSearchPage("dua", "all");
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("getSuggestions", () => {
  it("sends the trimmed input to the suggestions endpoint", async () => {
    execute.mockResolvedValue(suggestionPage("dua lipa"));

    const rows = await getSuggestions("  dua ");

    expect(execute).toHaveBeenCalledWith("/music/get_search_suggestions", { input: "dua", client: "YTMUSIC" });
    expect(rows.map((row) => row.kind)).toEqual(["completion", "track"]);
  });
});

describe("typeAhead", () => {
  it("merges suggestions with the All search rows and caches the result", async () => {
    execute.mockImplementation(async (endpoint: string) =>
      endpoint === "/search" ? page("search-1") : suggestionPage("dua lipa"),
    );

    const rows = await typeAhead("dua");
    expect(rows.map((row) => row.kind)).toEqual(["completion", "track", "track"]);
    expect(execute.mock.calls.map((call) => call[0]).sort()).toEqual(["/music/get_search_suggestions", "/search"]);

    await typeAhead("dua");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(peekTypeAhead("dua")).toBeDefined();
  });

  it("still returns search rows when the suggestions call fails", async () => {
    execute.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/search") return page("search-2");
      throw new Error("suggestions down");
    });

    const pending = typeAhead("dua");
    await vi.advanceTimersByTimeAsync(600);
    const rows = await pending;

    expect(rows.map((row) => row.kind)).toEqual(["track"]);
  });

  it("fails when both calls fail and does not cache the failure", async () => {
    execute.mockRejectedValue(new Error("offline"));

    const pending = typeAhead("dua");
    const settled = expect(pending).rejects.toThrow("Type-ahead failed");
    await vi.advanceTimersByTimeAsync(1200);
    await settled;
    expect(peekTypeAhead("dua")).toBeUndefined();
  });

  it("returns nothing for an empty query", async () => {
    await expect(typeAhead("  ")).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});

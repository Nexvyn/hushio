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

import {
  getAlbumPage,
  getArtistPage,
  getPlaylistPage,
  MAX_SHELF_PAGES,
  playlistBrowseId,
  restOfShelf,
} from "./browse";

function row(id: string) {
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: `Title ${id}` }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Nova" }] } } },
      ],
      thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [] } } },
    },
  };
}

function albumResponse(rows: unknown[], token: string | null) {
  return {
    header: {
      musicDetailHeaderRenderer: {
        title: { runs: [{ text: "Night Drive" }] },
        subtitle: { runs: [{ text: "Album" }, { text: " • " }, { text: "2023" }] },
      },
    },
    contents: {
      twoColumnBrowseResultsRenderer: {
        secondaryContents: {
          sectionListRenderer: {
            contents: [
              {
                musicShelfRenderer: {
                  contents: rows,
                  ...(token ? { continuations: [{ nextContinuationData: { continuation: token } }] } : {}),
                },
              },
            ],
          },
        },
      },
    },
  };
}

function continuationPage(rows: unknown[], token: string | null) {
  return {
    continuationContents: {
      musicPlaylistShelfContinuation: {
        contents: rows,
        ...(token ? { continuations: [{ nextContinuationData: { continuation: token } }] } : {}),
      },
    },
  };
}

beforeEach(() => {
  execute.mockReset();
});

describe("playlistBrowseId", () => {
  it("keeps playlist ids as they are and prefixes plain ids with VL", () => {
    expect(playlistBrowseId("PLabc")).toBe("PLabc");
    expect(playlistBrowseId("VLabc")).toBe("VLabc");
    expect(playlistBrowseId("OLAK5uy_x")).toBe("OLAK5uy_x");
    expect(playlistBrowseId("abc")).toBe("VLabc");
  });
});

describe("getArtistPage", () => {
  it("browses the artist channel and parses the page", async () => {
    execute.mockResolvedValueOnce({
      data: { header: { musicVisualHeaderRenderer: { title: { runs: [{ text: "Nova" }] } } } },
    });

    const page = await getArtistPage("UCnova");

    expect(execute).toHaveBeenCalledWith("/browse", { browseId: "UCnova", client: "YTMUSIC" });
    expect(page.artist.name).toBe("Nova");
  });
});

describe("getAlbumPage", () => {
  it("follows every continuation until the shelf runs out", async () => {
    execute
      .mockResolvedValueOnce({ data: albumResponse([row("a1")], "t1") })
      .mockResolvedValueOnce({ data: continuationPage([row("a2")], "t2") })
      .mockResolvedValueOnce({ data: continuationPage([row("a3")], null) });

    const page = await getAlbumPage("MPREalb");

    expect(page.tracks.map((track) => track.id)).toEqual(["a1", "a2", "a3"]);
    expect(page.continuation).toBeNull();
    expect(execute).toHaveBeenNthCalledWith(2, "/browse", { continuation: "t1", client: "YTMUSIC" });
    expect(execute).toHaveBeenNthCalledWith(3, "/browse", { continuation: "t2", client: "YTMUSIC" });
  });

  it("returns the first page alone when the continuation request fails", async () => {
    execute
      .mockResolvedValueOnce({ data: albumResponse([row("a1")], "t1") })
      .mockRejectedValue(new Error("offline"));

    const page = await getAlbumPage("MPREalb");

    expect(page.tracks.map((track) => track.id)).toEqual(["a1"]);
  });
});

describe("getPlaylistPage", () => {
  it("browses with the VL prefix for plain ids and builds the meta line from the full count", async () => {
    execute
      .mockResolvedValueOnce({
        data: {
          header: { musicResponsiveHeaderRenderer: { title: { runs: [{ text: "Mix" }] } } },
          contents: {
            twoColumnBrowseResultsRenderer: {
              secondaryContents: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicPlaylistShelfRenderer: {
                        contents: [row("p1"), row("p2")],
                        continuations: [{ nextContinuationData: { continuation: "more" } }],
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: continuationPage([row("p3")], null) });

    const page = await getPlaylistPage("abc");

    expect(execute).toHaveBeenNthCalledWith(1, "/browse", { browseId: "VLabc", client: "YTMUSIC" });
    expect(page.title).toBe("Mix");
    expect(page.tracks.map((track) => track.id)).toEqual(["p1", "p2", "p3"]);
    expect(page.meta).toBe("PLAYLIST • 3 TRACKS");
    expect(page.continuation).toBeNull();
  });
});

describe("restOfShelf", () => {
  it("stops when a page yields no songs", async () => {
    execute
      .mockResolvedValueOnce({ data: continuationPage([row("b1")], "t1") })
      .mockResolvedValueOnce({ data: continuationPage([], "t2") });

    const songs = await restOfShelf("t0");

    expect(songs.map((song) => song.id)).toEqual(["b1"]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a token", async () => {
    expect(await restOfShelf(null)).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("stops after the page cap even when the token never ends", async () => {
    let count = 0;
    execute.mockImplementation(async () => ({ data: continuationPage([row(`e${count++}`)], "forever") }));

    const songs = await restOfShelf("start");

    expect(MAX_SHELF_PAGES).toBe(50);
    expect(execute).toHaveBeenCalledTimes(MAX_SHELF_PAGES);
    expect(songs).toHaveLength(MAX_SHELF_PAGES);
  });
});

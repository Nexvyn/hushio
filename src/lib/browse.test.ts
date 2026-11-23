import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, getSession } = vi.hoisted(() => {
  const execute = vi.fn();
  return { execute, getSession: vi.fn(async () => ({ innertube: { actions: { execute } } })) };
});

vi.mock("youtubei.js", () => ({ Innertube: { create: vi.fn() } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("./market", () => ({ marketValue: () => ({ location: "IN", lang: "en" }) }));
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
import { MAX_SONGS } from "./importParse";

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

function appendPage(rows: unknown[], token: string | null) {
  return {
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            ...rows,
            ...(token ? [{ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } }] : []),
          ],
        },
      },
    ],
  };
}

function playlistFirstPage(rows: unknown[], token: string | null) {
  return {
    contents: {
      twoColumnBrowseResultsRenderer: {
        secondaryContents: {
          sectionListRenderer: {
            contents: [
              {
                musicPlaylistShelfRenderer: {
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

beforeEach(() => {
  execute.mockReset();
});

describe("playlistBrowseId", () => {
  it("keeps VL ids as they are and prefixes every other playlist id with VL", () => {
    expect(playlistBrowseId("VLPLabc")).toBe("VLPLabc");
    expect(playlistBrowseId("PLabc")).toBe("VLPLabc");
    expect(playlistBrowseId("OLAK5uy_x")).toBe("VLOLAK5uy_x");
    expect(playlistBrowseId("RDCLAK5uy_y")).toBe("VLRDCLAK5uy_y");
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

  it("asks for the session in the listener's market, not a fixed one", async () => {
    execute.mockResolvedValueOnce({
      data: { header: { musicVisualHeaderRenderer: { title: { runs: [{ text: "Nova" }] } } } },
    });

    await getArtistPage("UCnova");

    expect(getSession).toHaveBeenCalledWith({ location: "IN", lang: "en" });
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
    expect(page.meta).toBe("3 songs");
    expect(page.continuation).toBeNull();
  });

  it("keeps track durations from both the first page and continuation rows", async () => {
    const timed = (id: string, value: string) => ({
      musicResponsiveListItemRenderer: {
        ...row(id).musicResponsiveListItemRenderer,
        fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: value }] } } }],
      },
    });
    execute
      .mockResolvedValueOnce({
        data: {
          header: { musicResponsiveHeaderRenderer: { title: { runs: [{ text: "Mix" }] } } },
          contents: {
            twoColumnBrowseResultsRenderer: {
              secondaryContents: {
                sectionListRenderer: {
                  contents: [{ musicPlaylistShelfRenderer: { contents: [timed("p1", "4:12")], continuations: [{ nextContinuationData: { continuation: "c1" } }] } }],
                },
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({ data: continuationPage([timed("p2", "1:00:00")], null) });

    const page = await getPlaylistPage("abc");

    expect(page.tracks.map((track) => [track.id, track.duration])).toEqual([
      ["p1", 252],
      ["p2", 3600],
    ]);
    expect(page.meta).toBe("2 songs · 1 hr 4 min");
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

  it("stops when a page only repeats songs already read", async () => {
    execute
      .mockResolvedValueOnce({ data: appendPage([row("b1")], "t1") })
      .mockResolvedValueOnce({ data: appendPage([row("b1")], "t2") })
      .mockResolvedValueOnce({ data: appendPage([row("b2")], null) });

    const songs = await restOfShelf("t0");

    expect(songs.map((song) => song.id)).toEqual(["b1"]);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("stops once the import limit is reached", async () => {
    let batch = 0;
    execute.mockImplementation(async () => {
      const rows = Array.from({ length: 1000 }, (_, index) => row(`m${batch}-${index}`));
      batch += 1;
      return { data: appendPage(rows, "more") };
    });

    const songs = await restOfShelf("start");

    expect(songs).toHaveLength(MAX_SONGS);
    expect(execute).toHaveBeenCalledTimes(MAX_SONGS / 1000);
  }, 60_000);
});

describe("getPlaylistPage across continuations", () => {
  it("reads every page of a long playlist and drops repeated ids", async () => {
    execute
      .mockResolvedValueOnce({ data: playlistFirstPage([row("p1"), row("p2")], "t1") })
      .mockResolvedValueOnce({ data: appendPage([row("p3"), row("p2")], "t2") })
      .mockResolvedValueOnce({ data: appendPage([row("p4")], null) });

    const page = await getPlaylistPage("PLlong");

    expect(page.tracks.map((track) => track.id)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(page.meta).toBe("4 songs");
    expect(execute).toHaveBeenNthCalledWith(2, "/browse", { continuation: "t1", client: "YTMUSIC" });
    expect(execute).toHaveBeenNthCalledWith(3, "/browse", { continuation: "t2", client: "YTMUSIC" });
  });

  it("keeps the songs already read when a later page fails", async () => {
    execute
      .mockResolvedValueOnce({ data: playlistFirstPage([row("p1")], "t1") })
      .mockResolvedValueOnce({ data: appendPage([row("p2")], "t2") })
      .mockRejectedValueOnce(new Error("offline"));

    const page = await getPlaylistPage("PLlong");

    expect(page.tracks.map((track) => track.id)).toEqual(["p1", "p2"]);
    expect(page.incomplete).toBe(true);
  });
});

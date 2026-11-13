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

import type * as MoodPageModule from "./moodPage";
import type { SearchSong } from "./searchParse";

const ART = "https://lh3.googleusercontent.com/cover=s60";
const MINUTE = 60_000;

function song(id: string, square = true) {
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: `Song ${id}` }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Song • Dua Lipa" }] } } },
      ],
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: { thumbnails: [{ url: ART, width: square ? 544 : 480, height: square ? 544 : 270 }] },
        },
      },
    },
  };
}

function card(title: string, browseId: string) {
  return {
    musicTwoRowItemRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: { runs: [{ text: `Kind • ${title}` }] },
      navigationEndpoint: { browseEndpoint: { browseId } },
      thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: ART }] } } },
    },
  };
}

function carousel(title: string, contents: unknown[]) {
  return {
    musicCarouselShelfRenderer: {
      header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: title }] } } },
      contents,
    },
  };
}

function grid(title: string, items: unknown[]) {
  return { gridRenderer: { header: { gridHeaderRenderer: { title: { runs: [{ text: title }] } } }, items } };
}

function listShelf(title: string, contents: unknown[]) {
  return { musicShelfRenderer: { title: { runs: [{ text: title }] }, contents } };
}

function moodPage(sections: unknown[]) {
  return {
    header: { musicHeaderRenderer: { title: { runs: [{ text: "Lo-fi beats" }] } } },
    contents: {
      singleColumnBrowseResultsRenderer: {
        tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: sections } } } }],
      },
    },
  };
}

function answer(pages: Record<string, unknown>) {
  execute.mockImplementation(async (_path: string, body: { browseId: string }) => {
    const data = pages[body.browseId];
    if (data instanceof Error) throw data;
    return { data: data ?? {} };
  });
}

function fakeSong(id: string): SearchSong {
  return {
    id,
    title: `Song ${id}`,
    artist: "Dua Lipa",
    thumb: null,
    artistId: null,
    albumId: null,
    album: null,
    duration: 180,
    explicit: false,
    isVideo: false,
  };
}

let moodPageModule: typeof MoodPageModule;

beforeEach(async () => {
  vi.resetModules();
  moodPageModule = await import("./moodPage");
  execute.mockReset();
  getSession.mockClear();
});

describe("parseMoodPage", () => {
  it("keeps headed shelves in order and maps each card to its kind", () => {
    const page = moodPageModule.parseMoodPage(
      moodPage([
        carousel("Playlists", [card("Chill", "VLPL1"), card("Gold", "MPREb_1"), card("Ada", "UCa")]),
        grid("Artists", [card("Bea", "UCb"), card("Other", "FEnope")]),
        listShelf("Up first", [song("s1"), song("v1", false)]),
      ]),
    );
    expect(page?.title).toBe("Lo-fi beats");
    expect(page?.shelves.map((shelf) => shelf.title)).toEqual(["Playlists", "Artists", "Up first"]);
    expect(page?.shelves[0].items).toMatchObject([
      { playlist: { id: "VLPL1", title: "Chill", subtitle: "Kind • Chill" } },
      { album: { id: "MPREb_1", title: "Gold" } },
      { artist: { id: "UCa", title: "Ada" } },
    ]);
    expect(page?.shelves[1].items).toMatchObject([{ artist: { id: "UCb", title: "Bea" } }]);
    expect(page?.shelves[2].items).toMatchObject([{ track: { id: "s1", title: "Song s1", artist: "Dua Lipa" } }]);
  });

  it("drops shelves without a heading or without items", () => {
    const page = moodPageModule.parseMoodPage(
      moodPage([
        carousel("", [card("Chill", "VLPL1")]),
        carousel("Empty", [card("Other", "FEnope")]),
        listShelf("Songs", [song("s1")]),
      ]),
    );
    expect(page?.shelves.map((shelf) => shelf.title)).toEqual(["Songs"]);
  });

  it("returns null when the page has no sections", () => {
    expect(moodPageModule.parseMoodPage({ header: {} })).toBeNull();
  });
});

describe("loadMoodPage", () => {
  const page = moodPage([listShelf("Songs", [song("s1")])]);

  it("reuses a page that has shelves for an hour", async () => {
    execute.mockResolvedValue({ data: page });
    await moodPageModule.loadMoodPage("p1", 0);
    await moodPageModule.loadMoodPage("p1", 59 * MINUTE);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(moodPageModule.peekMoodPage("p1", 59 * MINUTE)?.title).toBe("Lo-fi beats");

    await moodPageModule.loadMoodPage("p1", 61 * MINUTE);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("returns the stale page when a refresh fails", async () => {
    execute.mockResolvedValueOnce({ data: page });
    await moodPageModule.loadMoodPage("p1", 0);
    execute.mockRejectedValueOnce(new Error("offline"));
    const stale = await moodPageModule.loadMoodPage("p1", 2 * 60 * MINUTE);
    expect(stale?.shelves.map((shelf) => shelf.title)).toEqual(["Songs"]);
  });

  it("returns null when a load fails and nothing is cached", async () => {
    execute.mockRejectedValue(new Error("offline"));
    expect(await moodPageModule.loadMoodPage("p2", 0)).toBeNull();
  });

  it("does not cache a page without shelves", async () => {
    execute.mockResolvedValue({ data: moodPage([listShelf("", [song("s1")])]) });
    await moodPageModule.loadMoodPage("p3", 0);
    expect(moodPageModule.peekMoodPage("p3", 0)).toBeUndefined();
    await moodPageModule.loadMoodPage("p3", 1);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("getPlaylistTracks", () => {
  it("keeps only audio tracks from a playlist", async () => {
    answer({ VLPL9: { contents: [song("a1"), song("v1", false)] } });
    const tracks = await moodPageModule.getPlaylistTracks("VLPL9");
    expect(tracks.map((track) => track.id)).toEqual(["a1"]);
    expect(execute).toHaveBeenCalledWith("/browse", { browseId: "VLPL9", client: "YTMUSIC" });
  });

  it("adds the VL prefix to every playlist id that lacks it", async () => {
    answer({ VLabc: { contents: [song("a1")] }, VLPLxyz: { contents: [song("b1")] } });
    await moodPageModule.getPlaylistTracks("abc");
    await moodPageModule.getPlaylistTracks("PLxyz");
    expect(execute.mock.calls.map((call) => call[1].browseId)).toEqual(["VLabc", "VLPLxyz"]);
  });
});

describe("loadMix", () => {
  const playlist = (id: string) => ({ id, title: id, subtitle: "", thumb: null });

  it("interleaves the songs with the first three playlists", async () => {
    answer({
      VLpl1: { contents: [song("a1"), song("a2")] },
      VLpl2: { contents: [song("b1")] },
      VLpl3: { contents: [song("c1")] },
      VLpl4: { contents: [song("d1")] },
    });
    const mix = await moodPageModule.loadMix(
      "p1",
      [fakeSong("s1"), fakeSong("s2")],
      [playlist("pl1"), playlist("pl2"), playlist("pl3"), playlist("pl4")],
    );
    expect(mix.map((track) => track.id)).toEqual(["s1", "a1", "b1", "c1", "s2", "a2"]);
    const browsed = execute.mock.calls.map((call) => call[1].browseId);
    expect(browsed).not.toContain("VLpl4");
  });

  it("mixes only the playlists when the page has no songs", async () => {
    answer({ VLpl1: { contents: [song("a1"), song("a2")] }, VLpl2: { contents: [song("b1")] } });
    const mix = await moodPageModule.loadMix("p2", [], [playlist("pl1"), playlist("pl2")]);
    expect(mix.map((track) => track.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("treats a playlist that fails to load as empty", async () => {
    answer({ VLpl1: new Error("offline"), VLpl2: { contents: [song("b1")] } });
    const mix = await moodPageModule.loadMix("p3", [fakeSong("s1")], [playlist("pl1"), playlist("pl2")]);
    expect(mix.map((track) => track.id)).toEqual(["s1", "b1"]);
  });

  it("returns the cached mix for an hour", async () => {
    answer({ VLpl1: { contents: [song("a1")] } });
    await moodPageModule.loadMix("p4", [], [playlist("pl1")], 0);
    await moodPageModule.loadMix("p4", [], [playlist("pl1")], 30 * MINUTE);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

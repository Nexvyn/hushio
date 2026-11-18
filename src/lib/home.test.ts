import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Json } from "./innertube";

const { execute, getSession } = vi.hoisted(() => {
  const execute = vi.fn();
  return { execute, getSession: vi.fn(async () => ({ innertube: { actions: { execute } } })) };
});

vi.mock("youtubei.js", () => ({ Innertube: { create: vi.fn() } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("./innertube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./innertube")>()),
  getSession,
  getSearchSession: getSession,
}));
vi.mock("./market", () => ({ marketValue: () => ({ location: "US", lang: "en" }) }));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import {
  HOME_PAGES,
  HOME_SHELF_MAX,
  HOME_TTL_MS,
  fetchHomeShelves,
  fetchHomePage,
  homeContinuationOf,
  homeTracks,
  parseHomeShelves,
  refreshHome,
} from "./home";
import { useHomeCache } from "../stores/homeCache";

const runs = (...parts: string[]) => ({
  runs: parts.flatMap((part, index) => (index === 0 ? [{ text: part }] : [{ text: " • " }, { text: part }])),
});
const thumb = (url: string) => ({
  musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url }] } },
});
const pageType = (type: string) => ({
  browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: type } },
});

const songCard = (id: string, title: string, artist: string): Json => ({
  musicTwoRowItemRenderer: {
    title: runs(title),
    subtitle: runs("Song", artist),
    thumbnailRenderer: thumb(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
    navigationEndpoint: {
      watchEndpoint: {
        videoId: id,
        watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_ATV" } },
      },
    },
  },
});

const albumCard = (id: string, title: string): Json => ({
  musicTwoRowItemRenderer: {
    title: runs(title),
    subtitle: runs("Album", "Band Name"),
    thumbnailRenderer: thumb("https://i.ytimg.com/vi/cover/hqdefault.jpg"),
    navigationEndpoint: { browseEndpoint: { browseId: id, ...pageType("MUSIC_PAGE_TYPE_ALBUM") } },
  },
});

const artistCard = (id: string, name: string): Json => ({
  musicTwoRowItemRenderer: {
    title: runs(name),
    subtitle: runs("Artist"),
    thumbnailRenderer: thumb("https://i.ytimg.com/vi/artist/hqdefault.jpg"),
    navigationEndpoint: { browseEndpoint: { browseId: id, ...pageType("MUSIC_PAGE_TYPE_ARTIST") } },
  },
});

const playlistCard = (id: string, title: string): Json => ({
  musicTwoRowItemRenderer: {
    title: runs(title),
    subtitle: runs("Playlist", "Curator"),
    thumbnailRenderer: thumb("https://i.ytimg.com/vi/list/hqdefault.jpg"),
    navigationEndpoint: { browseEndpoint: { browseId: id, ...pageType("MUSIC_PAGE_TYPE_PLAYLIST") } },
  },
});

const uploadCard = (id: string, title: string): Json => ({
  musicTwoRowItemRenderer: {
    title: runs(title),
    subtitle: runs("Video", "Someone"),
    thumbnailRenderer: thumb(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
    navigationEndpoint: {
      watchEndpoint: {
        videoId: id,
        watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_UGC" } },
      },
    },
  },
});

const responsiveSong = (id: string, title: string, artist: string): Json => ({
  musicResponsiveListItemRenderer: {
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: runs(title) } },
      { musicResponsiveListItemFlexColumnRenderer: { text: runs(artist, "3:04") } },
    ],
    playlistItemData: { videoId: id },
    thumbnail: thumb(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
    navigationEndpoint: { watchEndpoint: { videoId: id } },
  },
});

const shelf = (title: string | null, contents: Json[]): Json => ({
  musicCarouselShelfRenderer: {
    header: title === null ? {} : { musicCarouselShelfBasicHeaderRenderer: { title: runs(title) } },
    contents,
  },
});

const threeSongs = (prefix: string) => [
  songCard(`${prefix}1aaaaaaaa`, `${prefix} one`, "Artist"),
  songCard(`${prefix}2aaaaaaaa`, `${prefix} two`, "Artist"),
  songCard(`${prefix}3aaaaaaaa`, `${prefix} three`, "Artist"),
];

const page = (shelves: Json[], token?: string): Json => ({
  contents: shelves,
  continuations: token ? [{ nextContinuationData: { continuation: token } }] : [],
});

describe("parseHomeShelves", () => {
  it("keeps songs, albums, artists and playlists and drops uploads", () => {
    const [shelfOut] = parseHomeShelves(
      page([
        shelf("Quick picks", [
          songCard("abcdefghijk", "Song A", "Artist A"),
          albumCard("MPREb_album", "Album B"),
          artistCard("UCartistC", "Artist C"),
          playlistCard("VLPLlist", "Playlist D"),
          uploadCard("uploadvideo", "Upload E"),
        ]),
      ]),
    );

    expect(shelfOut?.title).toBe("Quick picks");
    expect(shelfOut?.items).toEqual([
      {
        kind: "track",
        track: {
          id: "abcdefghijk",
          title: "Song A",
          artist: "Artist A",
          thumb: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
        },
      },
      {
        kind: "album",
        id: "MPREb_album",
        title: "Album B",
        artist: "Band Name",
        thumb: "https://i.ytimg.com/vi/cover/hqdefault.jpg",
      },
      { kind: "artist", id: "UCartistC", name: "Artist C", thumb: "https://i.ytimg.com/vi/artist/hqdefault.jpg" },
      {
        kind: "playlist",
        id: "VLPLlist",
        title: "Playlist D",
        subtitle: "Playlist • Curator",
        thumb: "https://i.ytimg.com/vi/list/hqdefault.jpg",
      },
    ]);
  });

  it("reads songs from responsive list rows", () => {
    const [shelfOut] = parseHomeShelves(
      page([shelf("Mixed", [responsiveSong("rowsongaaaa", "Row song", "Row Artist"), ...threeSongs("x")])]),
    );

    expect(shelfOut?.items[0]).toEqual({
      kind: "track",
      track: {
        id: "rowsongaaaa",
        title: "Row song",
        artist: "Row Artist",
        thumb: "https://i.ytimg.com/vi/rowsongaaaa/hqdefault.jpg",
      },
    });
  });

  it("drops shelves with fewer than three usable items", () => {
    const shelves = parseHomeShelves(
      page([
        shelf("Too short", [songCard("aaaaaaaaaaa", "One", "A"), songCard("bbbbbbbbbbb", "Two", "A")]),
        shelf("Long enough", threeSongs("long")),
      ]),
    );

    expect(shelves.map((entry) => entry.title)).toEqual(["Long enough"]);
  });

  it("names a shelf without a title For you", () => {
    const [shelfOut] = parseHomeShelves(page([shelf(null, threeSongs("untitled"))]));
    expect(shelfOut?.title).toBe("For you");
  });

  it("caps each shelf at 24 items", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      songCard(`song${String(index).padStart(7, "0")}`, `Song ${index}`, "Artist"),
    );
    const [shelfOut] = parseHomeShelves(page([shelf("Long", many)]));
    expect(shelfOut?.items).toHaveLength(24);
  });

  it("returns nothing for a response without shelves", () => {
    expect(parseHomeShelves({})).toEqual([]);
    expect(parseHomeShelves(null)).toEqual([]);
  });
});

describe("fetchHomeShelves", () => {
  beforeEach(() => {
    execute.mockReset();
    getSession.mockClear();
  });

  it("requests the home browse id and pages through continuations", async () => {
    execute
      .mockResolvedValueOnce({ data: page([shelf("First", threeSongs("a"))], "token-1") })
      .mockResolvedValueOnce({ data: page([shelf("Second", threeSongs("b"))]) });

    const shelves = await fetchHomeShelves({ location: "US", lang: "en" });

    expect(getSession).toHaveBeenCalledWith({ location: "US", lang: "en" });
    expect(execute).toHaveBeenNthCalledWith(1, "/browse", { browseId: "FEmusic_home", client: "YTMUSIC" });
    expect(execute).toHaveBeenNthCalledWith(2, "/browse", { continuation: "token-1", client: "YTMUSIC" });
    expect(shelves.map((entry) => entry.title)).toEqual(["First", "Second"]);
  });

  it("stops after the home page limit", async () => {
    execute.mockImplementation(async () => ({ data: page([shelf("More", threeSongs("m"))], "again") }));

    const shelves = await fetchHomeShelves({ location: "US", lang: "en" });

    expect(execute).toHaveBeenCalledTimes(HOME_PAGES);
    expect(shelves).toHaveLength(HOME_PAGES);
  });

  it("keeps the first page when a continuation fails", async () => {
    execute
      .mockResolvedValueOnce({ data: page([shelf("Kept", threeSongs("k"))], "token") })
      .mockRejectedValueOnce(new Error("offline"));

    const shelves = await fetchHomeShelves({ location: "US", lang: "en" });

    expect(shelves.map((entry) => entry.title)).toEqual(["Kept"]);
  });

  it("returns at most eight shelves", async () => {
    const shelvesOnPage = Array.from({ length: 10 }, (_, index) => shelf(`S${index}`, threeSongs(`p${index}`)));
    execute.mockResolvedValueOnce({ data: page(shelvesOnPage) });

    const shelves = await fetchHomeShelves({ location: "US", lang: "en" });

    expect(shelves).toHaveLength(HOME_SHELF_MAX);
  });
});

describe("lazy Home pages", () => {
  it("loads only one page and preserves its continuation for scrolling", async () => {
    execute.mockReset();
    execute.mockResolvedValueOnce({ data: page([shelf("First", threeSongs("a"))], "next-page") });
    const first = await fetchHomePage({ location: "US", lang: "en" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(first.continuation).toBe("next-page");
    expect(first.shelves).toHaveLength(1);
  });
  it("prefers the page continuation over a nested shelf continuation", () => {
    expect(homeContinuationOf({
      shelf: { nextContinuationData: { continuation: "shelf-only" } },
      sectionListRenderer: { continuations: [{ nextContinuationData: { continuation: "page-next" } }] },
    })).toBe("page-next");
  });
});

describe("refreshHome", () => {
  const cachedShelves = [{ title: "Cached", items: [] }];

  beforeEach(() => {
    getSession.mockClear();
    execute.mockReset();
    useHomeCache.setState({ market: null, shelves: [], fetchedAt: null });
  });

  it("serves fresh cached shelves without a network call", async () => {
    useHomeCache.setState({ market: "US", shelves: cachedShelves, fetchedAt: Date.now() });

    await expect(refreshHome()).resolves.toEqual(cachedShelves);
    expect(execute).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledWith({ location: "US", lang: "en" });
  });

  it("fetches again once the cache is older than an hour and saves the result", async () => {
    useHomeCache.setState({ market: "US", shelves: cachedShelves, fetchedAt: Date.now() - HOME_TTL_MS - 1 });
    execute.mockResolvedValueOnce({ data: page([shelf("Fresh", threeSongs("f"))]) });

    const shelves = await refreshHome();

    expect(shelves.map((entry) => entry.title)).toEqual(["Fresh"]);
    expect(useHomeCache.getState()).toMatchObject({ market: "US", shelves });
  });

  it("ignores shelves cached for another market", async () => {
    useHomeCache.setState({ market: "IN", shelves: cachedShelves, fetchedAt: Date.now() });
    execute.mockResolvedValueOnce({ data: page([shelf("US", threeSongs("u"))]) });

    const shelves = await refreshHome();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(shelves.map((entry) => entry.title)).toEqual(["US"]);
  });

  it("shows stale cached shelves when the refresh fails", async () => {
    useHomeCache.setState({ market: "US", shelves: cachedShelves, fetchedAt: Date.now() - HOME_TTL_MS - 1 });
    execute.mockRejectedValue(new Error("offline"));

    await expect(refreshHome()).resolves.toEqual(cachedShelves);
  });

  it("rejects when the refresh fails and nothing is cached", async () => {
    execute.mockRejectedValue(new Error("offline"));

    await expect(refreshHome()).rejects.toThrow("offline");
    expect(useHomeCache.getState().shelves).toEqual([]);
  });
});

describe("homeTracks", () => {
  it("returns only the track items from every cached shelf", async () => {
    useHomeCache.setState({
      market: "US",
      fetchedAt: Date.now(),
      shelves: [
        {
          title: "Mixed",
          items: [
            { kind: "track", track: { id: "t1", title: "One", artist: "A", thumb: null } },
            { kind: "artist", id: "UCx", name: "Someone", thumb: null },
          ],
        },
        { title: "Tracks", items: [{ kind: "track", track: { id: "t2", title: "Two", artist: "B", thumb: null } }] },
      ],
    });

    await expect(homeTracks()).resolves.toEqual([
      { id: "t1", title: "One", artist: "A", thumb: null },
      { id: "t2", title: "Two", artist: "B", thumb: null },
    ]);
  });
});

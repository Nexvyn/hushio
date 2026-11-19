import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./browse", () => ({ getArtistPage: vi.fn(), getReleaseGrid: vi.fn() }));

import { getArtistPage, getReleaseGrid } from "./browse";
import { parseArtistPage, parseReleaseGrid, parseReleasePage, type ArtistPage } from "./browseParse";
import type { HomeItem, HomeShelf } from "./home";
import { availableFilters, filterReleases, getDiscography, getMoreByArtist, isReleaseShelf, type Release } from "./discography";

const ALBUM_PAGE_TYPE = "MUSIC_PAGE_TYPE_ALBUM";

function card(id: string, title: string, subtitle: string) {
  return {
    musicTwoRowItemRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: { runs: [{ text: subtitle }] },
      navigationEndpoint: {
        browseEndpoint: {
          browseId: id,
          browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: ALBUM_PAGE_TYPE } },
        },
      },
      thumbnailRenderer: {
        musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/cover=w120-h120" }] } },
      },
    },
  };
}

function album(id: string, title: string): HomeItem {
  return { kind: "album", id, title, artist: "Nova", thumb: null };
}

function artistPage(id: string, shelves: HomeShelf[]): ArtistPage {
  return {
    artist: { id, name: "Nova", thumb: null },
    description: null,
    subscriberCount: null,
    monthlyListeners: null,
    songs: [],
    shelves,
  };
}

function release(id: string, year: string | null, type: Release["type"]): Release {
  return { id, title: id, thumb: null, year, type };
}

describe("parseReleaseGrid", () => {
  it("keeps only album cards and reads year and type from the subtitle", () => {
    const data = {
      contents: [
        card("MPREa1", "Night Drive", "2023"),
        card("MPREe1", "Coast EP", "EP • 2024"),
        card("MPREe1", "Coast EP", "EP • 2024"),
        {
          musicTwoRowItemRenderer: {
            title: { runs: [{ text: "Clip" }] },
            subtitle: { runs: [{ text: "2020" }] },
            navigationEndpoint: { browseEndpoint: { browseId: "MPVmusic", browseEndpointContextSupportedConfigs: {} } },
          },
        },
      ],
    };
    const grid = parseReleaseGrid(data);

    expect(grid.releases.map((item) => [item.id, item.year, item.type])).toEqual([
      ["MPREa1", "2023", null],
      ["MPREe1", "2024", "EP"],
    ]);
    expect(grid.releases[0].thumb).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);
    expect(grid.continuation).toBeNull();
  });
});

describe("album footer info", () => {
  it("reads the release date and copyright lines from the page footer", () => {
    const data = {
      header: {
        musicDetailHeaderRenderer: {
          title: { runs: [{ text: "Night Drive" }] },
          subtitle: { runs: [{ text: "Album" }, { text: " • " }, { text: "Nova" }, { text: " • " }, { text: "2020" }] },
          secondSubtitle: { runs: [{ text: "10 songs • 40 minutes" }] },
        },
      },
      musicDescriptionShelfRenderer: {
        footer: {
          runs: [
            { text: "Released March 4, 2020" },
            { text: " • " },
            { text: "℗ 2020 Nova Records" },
            { text: " • " },
            { text: "© 2020 Nova Records" },
          ],
        },
      },
    };
    const album = parseReleasePage(data, "MPREalb").album;

    expect(album.releaseDate).toBe("March 4, 2020");
    expect(album.copyright).toEqual(["℗ 2020 Nova Records", "© 2020 Nova Records"]);
    expect(album.year).toBe("2020");
  });

  it("leaves the release date null and the copyright empty when the page has neither", () => {
    const data = {
      header: { musicDetailHeaderRenderer: { title: { runs: [{ text: "Night Drive" }] }, subtitle: { runs: [{ text: "Album" }, { text: " • " }, { text: "2020" }] } } },
    };
    const album = parseReleasePage(data, "MPREalb").album;

    expect(album.releaseDate).toBeNull();
    expect(album.copyright).toEqual([]);
  });
});

describe("artist shelves", () => {
  it("keeps the see-all endpoint of a shelf", () => {
    const data = {
      header: { musicImmersiveHeaderRenderer: { title: { runs: [{ text: "Nova" }] } } },
      contents: {
        singleColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicCarouselShelfRenderer: {
                          header: {
                            musicCarouselShelfBasicHeaderRenderer: {
                              title: { runs: [{ text: "Albums" }] },
                              moreContentButton: {
                                buttonRenderer: {
                                  navigationEndpoint: { browseEndpoint: { browseId: "UCnova_albums", params: "p1" } },
                                },
                              },
                            },
                          },
                          contents: [card("MPREa1", "Night Drive", "2023")],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    const page = parseArtistPage(data, "UCnova");

    expect(page.shelves).toHaveLength(1);
    expect(page.shelves[0].more).toEqual({ browseId: "UCnova_albums", params: "p1" });
    expect(page.shelves[0].items[0]).toMatchObject({ kind: "album", id: "MPREa1", title: "Night Drive" });
  });

  it("recognises release shelves by title", () => {
    expect(isReleaseShelf("Albums")).toBe(true);
    expect(isReleaseShelf("Singles & EPs")).toBe(true);
    expect(isReleaseShelf("Fans might also like")).toBe(false);
  });
});

describe("getDiscography", () => {
  beforeEach(() => {
    vi.mocked(getArtistPage).mockReset();
    vi.mocked(getReleaseGrid).mockReset();
  });

  it("merges the full album and single lists, newest first, without duplicates", async () => {
    vi.mocked(getArtistPage).mockResolvedValue(
      artistPage("UCnova-merge", [
        { title: "Albums", items: [album("MPREa1", "Night Drive"), album("MPREa2", "Old")], more: { browseId: "UCnova_albums" } },
        { title: "Singles & EPs", items: [album("MPREs1", "Single One")] },
        { title: "Fans might also like", items: [album("MPREx", "Other")] },
      ]),
    );
    vi.mocked(getReleaseGrid).mockResolvedValue([
      { id: "MPREa1", title: "Night Drive", thumb: null, year: "2023", type: "Album" },
      { id: "MPREa2", title: "Old", thumb: null, year: "2019", type: null },
      { id: "MPREe1", title: "Coast EP", thumb: null, year: "2024", type: "EP" },
      { id: "MPREa1", title: "Night Drive", thumb: null, year: "2023", type: "Album" },
    ]);

    const discography = await getDiscography("UCnova-merge");

    expect(discography.artistName).toBe("Nova");
    expect(discography.releases.map((item) => [item.id, item.type])).toEqual([
      ["MPREe1", "EP"],
      ["MPREa1", "Album"],
      ["MPREa2", "Album"],
      ["MPREs1", "Single"],
    ]);
    expect(getReleaseGrid).toHaveBeenCalledWith({ browseId: "UCnova_albums" });
  });

  it("falls back to the shelf items when the full list cannot be loaded", async () => {
    vi.mocked(getArtistPage).mockResolvedValue(
      artistPage("UCnova-fallback", [{ title: "Albums", items: [album("MPREa1", "Night Drive")], more: { browseId: "UCnova_albums" } }]),
    );
    vi.mocked(getReleaseGrid).mockRejectedValue(new Error("offline"));

    const discography = await getDiscography("UCnova-fallback");

    expect(discography.releases).toEqual([{ id: "MPREa1", title: "Night Drive", thumb: null, year: null, type: "Album" }]);
  });

  it("offers only the filters that have releases", () => {
    const albumsOnly = [release("a", "2020", "Album"), release("b", "2021", "Album")];
    const mixed = [...albumsOnly, release("s", "2022", "Single"), release("c", "2018", "Compilation")];

    expect(availableFilters(albumsOnly)).toEqual(["all", "albums"]);
    expect(availableFilters(mixed)).toEqual(["all", "albums", "singles", "compilations"]);
    expect(filterReleases(mixed, "singles").map((item) => item.id)).toEqual(["s"]);
  });
});

describe("getMoreByArtist", () => {
  beforeEach(() => {
    vi.mocked(getArtistPage).mockReset();
  });

  it("lists the artist's other releases and leaves out the current album", async () => {
    vi.mocked(getArtistPage).mockResolvedValue(
      artistPage("UCnova-more", [
        { title: "Albums", items: [album("MPREcur", "Current"), album("MPREa1", "Night Drive")] },
        { title: "Singles", items: [album("MPREs1", "Single One")] },
      ]),
    );

    const shelf = await getMoreByArtist("UCnova-more", "MPREcur");

    expect(shelf?.title).toBe("More by Nova");
    expect(shelf?.items.map((item) => (item.kind === "album" ? item.id : item.kind))).toEqual(["MPREa1", "MPREs1"]);
  });

  it("returns null when the current album is the only release", async () => {
    vi.mocked(getArtistPage).mockResolvedValue(artistPage("UCnova-only", [{ title: "Albums", items: [album("MPREcur", "Current")] }]));

    expect(await getMoreByArtist("UCnova-only", "MPREcur")).toBeNull();
  });
});

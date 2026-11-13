import { describe, expect, it } from "vitest";
import { CHARTS_BROWSE_ID, NEW_RELEASES_BROWSE_ID, parseChartsPage, parseNewReleases } from "./charts";

function songRow(id: string, title: string, artist: string, artistId: string) {
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: {
              runs: [
                {
                  text: artist,
                  navigationEndpoint: { browseEndpoint: { browseId: artistId } },
                },
              ],
            },
          },
        },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "1" }, { text: "up" }] } } },
      ],
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: { thumbnails: [{ url: `https://img/${id}.jpg`, width: 60, height: 60 }] },
        },
      },
    },
  };
}

function albumRow(id: string, title: string, artist: string, year: string) {
  return {
    musicTwoRowItemRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: { runs: [{ text: artist }, { text: " • " }, { text: year }] },
      navigationEndpoint: { browseEndpoint: { browseId: id } },
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: { thumbnails: [{ url: `https://img/${id}.jpg`, width: 60, height: 60 }] },
        },
      },
    },
  };
}

describe("parseChartsPage", () => {
  it("reads the songs and albums of a shelf", () => {
    const page = parseChartsPage({
      musicCarouselShelfRenderer: {
        header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: "Trending" }] } } },
        contents: [songRow("vid1", "Song One", "Nova", "UCnova"), albumRow("MPREb1", "Album One", "Nova", "2026")],
      },
    });
    expect(page.shelves).toHaveLength(1);
    expect(page.shelves[0].title).toBe("Trending");
    expect(page.shelves[0].songs[0]).toMatchObject({ id: "vid1", title: "Song One", artist: "Nova", artistId: "UCnova" });
    expect(page.shelves[0].albums[0]).toMatchObject({ id: "MPREb1", title: "Album One", artist: "Nova", year: "2026" });
  });

  it("reads a grid shelf", () => {
    const page = parseChartsPage({
      gridRenderer: {
        header: { gridHeaderRenderer: { title: { runs: [{ text: "Top songs" }] } } },
        items: [albumRow("MPREb2", "Album Two", "Wave", "2025")],
      },
    });
    expect(page.shelves[0].title).toBe("Top songs");
    expect(page.shelves[0].albums[0].id).toBe("MPREb2");
  });

  it("finds the continuation token", () => {
    const page = parseChartsPage({
      musicCarouselShelfRenderer: {
        header: { musicCarouselShelfBasicHeaderRenderer: { title: { runs: [{ text: "Trending" }] } } },
        contents: [],
      },
      continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "tok" } } },
    });
    expect(page.continuation).toBe("tok");
  });

  it("returns nothing for an empty page", () => {
    expect(parseChartsPage({}).shelves).toEqual([]);
  });
});

describe("parseNewReleases", () => {
  it("reads the albums of the grid", () => {
    const shelf = parseNewReleases({
      gridRenderer: {
        items: [albumRow("MPREb3", "Fresh", "Echo", "2026"), albumRow("MPREb4", "Newer", "Echo", "2026")],
      },
    });
    expect(shelf.albums.map((album) => album.id)).toEqual(["MPREb3", "MPREb4"]);
    expect(shelf.albums[0].thumb).toBe("https://img/MPREb3.jpg");
  });
});

describe("browse ids", () => {
  it("uses the chart and new release browse ids", () => {
    expect(CHARTS_BROWSE_ID).toBe("FEmusic_charts");
    expect(NEW_RELEASES_BROWSE_ID).toBe("FEmusic_new_releases");
  });
});

import { describe, expect, it } from "vitest";
import { parsePodcastEpisodeList, parsePodcastPage, parsePodcastShelves, podcastContinuation } from "./podcastParse";

const ART = "https://lh3.googleusercontent.com/show=s60";
const UPGRADED = "https://lh3.googleusercontent.com/show=s544";

const runs = (value: string) => ({ runs: [{ text: value }] });
const thumbs = (url = ART) => ({ musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url }] } } });

function show(id: string, title: string, author?: string) {
  return {
    musicTwoRowItemRenderer: {
      title: runs(title),
      ...(author === undefined ? {} : { subtitle: runs(author) }),
      navigationEndpoint: { browseEndpoint: { browseId: id } },
      thumbnailRenderer: thumbs(),
    },
  };
}

function episode(videoId: string, title: string, subtitle: string, description?: string) {
  return {
    musicMultiRowListItemRenderer: {
      onTap: { watchEndpoint: { videoId } },
      title: runs(title),
      subtitle: runs(subtitle),
      ...(description === undefined ? {} : { description: runs(description) }),
      thumbnail: thumbs(),
    },
  };
}

function shelf(title: string | null, contents: unknown[]) {
  return {
    musicCarouselShelfRenderer: {
      header: { musicCarouselShelfBasicHeaderRenderer: { title: runs(title ?? "") } },
      contents,
    },
  };
}

describe("parsePodcastShelves", () => {
  it("keeps only shows whose browse id starts with MPSP and gives them an upgraded thumb", () => {
    const data = {
      contents: [
        shelf("Popular shows", [
          show("MPSPa", "Show A", "Author A"),
          show("UCnotashow", "Channel"),
          show("MPSPb", "Show B"),
        ]),
      ],
    };
    const [parsed] = parsePodcastShelves(data);
    expect(parsed.title).toBe("Popular shows");
    expect(parsed.shows).toEqual([
      { id: "MPSPa", title: "Show A", author: "Author A", thumb: UPGRADED },
      { id: "MPSPb", title: "Show B", author: null, thumb: UPGRADED },
    ]);
    expect(parsed.episodes).toEqual([]);
  });

  it("reads episodes from multi-row items inside the same shelf", () => {
    const [parsed] = parsePodcastShelves({
      contents: [shelf("Top episodes", [episode("ep1", "Episode one", "Show A • 2 hr • Oct 12")])],
    });
    expect(parsed.shows).toEqual([]);
    expect(parsed.episodes.map((item) => item.id)).toEqual(["ep1"]);
  });

  it("drops shelves without a title and shelves with neither shows nor episodes", () => {
    const parsed = parsePodcastShelves({
      contents: [
        shelf(null, [show("MPSPa", "Show A")]),
        shelf("Empty", [show("UCnotashow", "Channel")]),
        shelf("Kept", [show("MPSPb", "Show B")]),
      ],
    });
    expect(parsed.map((item) => item.title)).toEqual(["Kept"]);
  });
});

describe("episode parsing", () => {
  it("reads the duration from the spoken length and keeps the last segment as the date", () => {
    const [first, second, third] = parsePodcastEpisodeList({
      contents: [
        episode("e1", "One", "Show A • 1 hr 3 min • Oct 12"),
        episode("e2", "Two", "Show A • 45 min"),
        episode("e3", "Three", "Show A • 30 sec • 2d ago"),
      ],
    });
    expect([first.duration, first.published]).toEqual([3780, "Oct 12"]);
    expect([second.duration, second.published]).toEqual([2700, null]);
    expect([third.duration, third.published]).toEqual([30, "2d ago"]);
  });

  it("gives 0 seconds when no segment is a spoken length", () => {
    const [item] = parsePodcastEpisodeList({ contents: [episode("e1", "One", "Show A • Oct 12")] });
    expect(item.duration).toBe(0);
  });

  it("truncates the description to 500 characters and marks the item as an episode", () => {
    const long = "x".repeat(600);
    const [item] = parsePodcastEpisodeList({ contents: [episode("e1", "One", "Show A", long)] });
    expect(item.description).toHaveLength(500);
    expect(item.episode).toBe(true);
  });

  it("uses the show for artist and album, falling back to the show title", () => {
    const data = { contents: [episode("e1", "One", "Date", "d")] };
    const [withAuthor] = parsePodcastEpisodeList(data, { title: "Show A", author: "Host" });
    const [withoutAuthor] = parsePodcastEpisodeList(data, { title: "Show A", author: null });
    expect([withAuthor.artist, withAuthor.album]).toEqual(["Host", "Show A"]);
    expect([withoutAuthor.artist, withoutAuthor.album]).toEqual(["Show A", "Show A"]);
  });

  it("skips episodes without a video id or a title", () => {
    const items = parsePodcastEpisodeList({
      contents: [
        { musicMultiRowListItemRenderer: { title: runs("No id"), subtitle: runs("Show") } },
        episode("e2", "", "Show"),
        episode("e3", "Good", "Show"),
      ],
    });
    expect(items.map((item) => item.id)).toEqual(["e3"]);
  });
});

describe("parsePodcastPage", () => {
  const header = {
    musicResponsiveHeaderRenderer: {
      title: runs("Show A"),
      subtitle: runs("Host A"),
      thumbnail: thumbs(),
    },
  };

  it("reads the header, description, episodes and the next continuation", () => {
    const data = {
      header,
      sections: [
        { musicDescriptionShelfRenderer: { description: runs("About the show") } },
        {
          musicShelfRenderer: {
            contents: [episode("e1", "Newest", "Oct 12 • 10 min"), episode("e2", "Older", "Oct 1 • 20 min")],
            continuations: [{ nextContinuationData: { continuation: "NEXT" } }],
          },
        },
      ],
    };
    const { page, continuation } = parsePodcastPage(data, "MPSPa");
    expect(continuation).toBe("NEXT");
    expect(page).toMatchObject({
      id: "MPSPa",
      title: "Show A",
      author: "Host A",
      thumb: UPGRADED,
      description: "About the show",
    });
    expect(page.episodes.map((item) => [item.id, item.artist, item.album])).toEqual([
      ["e1", "Host A", "Show A"],
      ["e2", "Host A", "Show A"],
    ]);
  });

  it("falls back to the title Podcast and no author when the header is missing", () => {
    const { page, continuation } = parsePodcastPage({}, "MPSPz");
    expect(page).toEqual({
      id: "MPSPz",
      title: "Podcast",
      author: null,
      thumb: null,
      description: null,
      episodes: [],
    });
    expect(continuation).toBeNull();
  });
});

describe("podcastContinuation", () => {
  it("returns the first continuation token or null", () => {
    expect(podcastContinuation({ a: { nextContinuationData: { continuation: "T1" } } })).toBe("T1");
    expect(podcastContinuation({ a: 1 })).toBeNull();
  });
});

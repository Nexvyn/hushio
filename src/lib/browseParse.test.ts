import { describe, expect, it } from "vitest";
import {
  parseArtistPage,
  parseReleasePage,
  parseRemotePlaylistPage,
  parseShelfPage,
  uniqueSongs,
  VIDEO_WORD,
} from "./browseParse";

type Opts = {
  id: string;
  title: string;
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration?: string;
  explicit?: boolean;
  video?: boolean;
  noThumb?: boolean;
};

function trackRow(opts: Opts) {
  const runs: unknown[] = [
    {
      text: opts.artist ?? "Nova",
      navigationEndpoint: {
        browseEndpoint: {
          browseId: opts.artistId ?? "UCnova",
          browseEndpointContextSupportedConfigs: {
            browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" },
          },
        },
      },
    },
  ];
  if (opts.album) {
    runs.push(
      { text: " • " },
      {
        text: opts.album,
        navigationEndpoint: {
          browseEndpoint: {
            browseId: opts.albumId ?? "MPREalbum",
            browseEndpointContextSupportedConfigs: {
              browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" },
            },
          },
        },
      },
    );
  }
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: opts.id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: opts.title }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs } } },
      ],
      fixedColumns: opts.duration
        ? [{ musicResponsiveListItemFixedColumnRenderer: { text: { simpleText: opts.duration } } }]
        : [],
      badges: opts.explicit ? [{ musicInlineBadgeRenderer: { icon: { iconType: "MUSIC_EXPLICIT_BADGE" } } }] : [],
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: {
            thumbnails: opts.noThumb
              ? []
              : [
                  {
                    url: `https://lh3.googleusercontent.com/${opts.id}=w60-h60`,
                    width: opts.video ? 480 : 60,
                    height: opts.video ? 360 : 60,
                  },
                ],
          },
        },
      },
    },
  };
}

function card(browseId: string, title: string, pageType?: string) {
  return {
    musicTwoRowItemRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: { runs: [{ text: "2024" }] },
      navigationEndpoint: {
        browseEndpoint: {
          browseId,
          browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } },
        },
      },
      thumbnailRenderer: {
        musicThumbnailRenderer: {
          thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/cover=w226-h226", width: 226, height: 226 }] },
        },
      },
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

function artistData() {
  return {
    header: {
      musicImmersiveHeaderRenderer: {
        title: { runs: [{ text: "Nova" }] },
        description: { runs: [{ text: "Dream pop from Lisbon." }] },
        monthlyListenerCount: { runs: [{ text: "332M monthly listeners" }] },
        subscriptionButton2: {
          subscribeButtonRenderer: { subscriberCountWithSubscribeText: { runs: [{ text: "1.2M subscribers" }] } },
        },
        thumbnail: {
          musicThumbnailRenderer: {
            thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/hero=w100-h100", width: 100, height: 100 }] },
          },
        },
      },
    },
    contents: {
      singleColumnBrowseResultsRenderer: {
        tabs: [
          {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: [
                    {
                      musicShelfRenderer: {
                        contents: [
                          trackRow({ id: "s1", title: "Glass", duration: "3:10" }),
                          trackRow({ id: "s2", title: "Salt", artist: "Nova", explicit: true }),
                          trackRow({ id: "s1", title: "Glass again" }),
                          trackRow({ id: "v1", title: "Glass live", video: true }),
                        ],
                      },
                    },
                    carousel("Albums", [card("MPREalb", "Night Drive", "MUSIC_PAGE_TYPE_ALBUM"), card("UCother", "Other", "")]),
                    carousel("Music videos", [card("MPREvid", "Clip", "MUSIC_PAGE_TYPE_ALBUM")]),
                    carousel("Featured on", [card("PLfeat", "Mix Tape", "MUSIC_PAGE_TYPE_PLAYLIST")]),
                    carousel("Empty", [{ musicTwoRowItemRenderer: { title: { runs: [{ text: "No id" }] } } }]),
                  ],
                },
              },
            },
          },
        ],
      },
    },
  };
}

describe("parseArtistPage", () => {
  it("reads the header, chips and description", () => {
    const page = parseArtistPage(artistData(), "UCnova");

    expect(page.artist).toEqual({
      id: "UCnova",
      name: "Nova",
      thumb: "https://lh3.googleusercontent.com/hero=w544-h544",
    });
    expect(page.description).toBe("Dream pop from Lisbon.");
    expect(page.subscriberCount).toBe("1.2M subscribers");
    expect(page.monthlyListeners).toBe("332M monthly listeners");
  });

  it("keeps song rows, including videos, de-duplicated by id and credited to the artist", () => {
    const page = parseArtistPage(artistData(), "UCnova");

    expect(page.songs.map((song) => song.id)).toEqual(["s1", "s2", "v1"]);
    expect(page.songs[0]).toMatchObject({ title: "Glass", duration: 190, artistId: "UCnova" });
    expect(page.songs[1]).toMatchObject({ title: "Salt", explicit: true });
    expect(page.songs[2]).toMatchObject({ title: "Glass live", isVideo: true });
  });

  it("credits placeholder song artists to the page name", () => {
    const data = {
      contents: {
        singleColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      { musicShelfRenderer: { contents: [trackRow({ id: "u1", title: "Loose", artist: "" })] } },
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

    expect(page.artist.name).toBe("");
    expect(page.songs[0]).toMatchObject({ artist: "", artistId: "UCnova" });
  });

  it("keeps shelves with browse cards, skips video shelves and cards without a browse id", () => {
    const page = parseArtistPage(artistData(), "UCnova");

    expect(page.shelves.map((shelf) => shelf.title)).toEqual(["Albums", "Featured on"]);
    expect(page.shelves[0].items).toEqual([
      { kind: "album", id: "MPREalb", title: "Night Drive", artist: "Nova", thumb: "https://lh3.googleusercontent.com/cover=w544-h544" },
      { kind: "artist", id: "UCother", name: "Other", thumb: "https://lh3.googleusercontent.com/cover=w544-h544" },
    ]);
    expect(page.shelves[1].items[0]).toMatchObject({ kind: "playlist", id: "PLfeat", title: "Mix Tape" });
  });

  it("falls back to the short subscriber text when the long forms are missing", () => {
    const data = {
      header: {
        musicImmersiveHeaderRenderer: {
          title: { runs: [{ text: "Nova" }] },
          subscriptionButton: { subscribeButtonRenderer: { shortSubscriberCountText: { simpleText: "9K subscribers" } } },
        },
      },
    };
    expect(parseArtistPage(data, "UCnova").subscriberCount).toBe("9K subscribers");
  });

  it("returns a placeholder name and no sections for an empty response", () => {
    const page = parseArtistPage({}, "UCempty");

    expect(page).toEqual({
      artist: { id: "UCempty", name: "", thumb: null },
      description: null,
      subscriberCount: null,
      monthlyListeners: null,
      songs: [],
      shelves: [],
    });
  });

  it("matches the video word only as a whole word", () => {
    expect(VIDEO_WORD.test("Videos")).toBe(true);
    expect(VIDEO_WORD.test("Video games")).toBe(true);
    expect(VIDEO_WORD.test("Videography")).toBe(false);
  });
});

function releaseData(opts: { header?: unknown; rows: unknown[]; shelfKind?: "musicShelfRenderer" | "musicPlaylistShelfRenderer"; next?: string }) {
  const shelf: Record<string, unknown> = { contents: opts.rows };
  if (opts.next) shelf.continuations = [{ nextContinuationData: { continuation: opts.next } }];
  return {
    header: opts.header,
    contents: {
      twoColumnBrowseResultsRenderer: {
        secondaryContents: {
          sectionListRenderer: {
            contents: [{ [opts.shelfKind ?? "musicShelfRenderer"]: shelf }],
          },
        },
      },
    },
  };
}

const albumHeader = {
  musicDetailHeaderRenderer: {
    title: { runs: [{ text: "Night Drive (Deluxe)" }] },
    subtitle: {
      runs: [
        { text: "Album" },
        { text: " • " },
        { text: "Nova", navigationEndpoint: { browseEndpoint: { browseId: "UCnova" } } },
        { text: " • " },
        { text: "2023" },
      ],
    },
    thumbnail: {
      croppedSquareThumbnailRenderer: {
        thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/alb=w544-h544", width: 544, height: 544 }] },
      },
    },
  },
};

describe("parseReleasePage", () => {
  it("reads the album header and tracks, and keeps the continuation", () => {
    const data = releaseData({
      header: albumHeader,
      rows: [trackRow({ id: "a1", title: "One", album: "Night Drive" }), trackRow({ id: "a2", title: "Two", noThumb: true })],
      next: "tok-2",
    });
    const page = parseReleasePage(data, "MPREalb");

    expect(page.kind).toBe("album");
    expect(page.album).toEqual({
      id: "MPREalb",
      title: "Night Drive (Deluxe)",
      artist: "Nova",
      year: "2023",
      thumb: "https://lh3.googleusercontent.com/alb=w544-h544",
      releaseType: "Album",
      description: null,
      artistId: "UCnova",
    });
    expect(page.tracks.map((track) => track.id)).toEqual(["a1", "a2"]);
    expect(page.tracks[1].thumb).toBe("https://lh3.googleusercontent.com/alb=w544-h544");
    expect(page.continuation).toBe("tok-2");
  });

  it("reads the release type and description from the page, and uses the first track when the header lacks an artist", () => {
    const header = {
      musicDetailHeaderRenderer: {
        title: { runs: [{ text: "Single Thing" }] },
        subtitle: { runs: [{ text: "Single" }, { text: " • " }, { text: "2021" }] },
      },
    };
    const data = releaseData({
      header,
      rows: [trackRow({ id: "x1", title: "Thing", artist: "Mira", artistId: "UCmira" })],
    });
    const withDescription = {
      ...data,
      contents: {
        ...data.contents,
        musicDescriptionShelfRenderer: { description: { runs: [{ text: "A short story." }] } },
      },
    };
    const page = parseReleasePage(withDescription, "MPREsingle");

    expect(page.album).toMatchObject({
      artist: "Mira",
      artistId: "UCmira",
      releaseType: "Single",
      year: "2021",
      description: "A short story.",
    });
  });

  it("falls back to the first track album and the placeholder when the header has no title", () => {
    const page = parseReleasePage(
      releaseData({ header: { musicDetailHeaderRenderer: {} }, rows: [trackRow({ id: "y1", title: "Y", album: "Loose" })] }),
      "MPREloose",
    );
    expect(page.album.title).toBe("Loose");

    const empty = parseReleasePage(releaseData({ header: { musicDetailHeaderRenderer: {} }, rows: [] }), "MPREnone");
    expect(empty.album).toMatchObject({ title: "", artist: "", releaseType: "Album", artistId: null });
  });

  it("treats a playlist shelf or a VL/PL id as a playlist page, without a description", () => {
    const shelf = parseReleasePage(
      releaseData({ header: albumHeader, rows: [trackRow({ id: "p1", title: "P" })], shelfKind: "musicPlaylistShelfRenderer" }),
      "MPREx",
    );
    expect(shelf.kind).toBe("playlist");
    expect(shelf.album.description).toBeNull();

    const byId = parseReleasePage(releaseData({ rows: [] }), "PLabc");
    expect(byId.kind).toBe("playlist");
  });

  it("reports other when there is no header and no shelf", () => {
    expect(parseReleasePage({}, "MPREx").kind).toBe("other");
  });
});

describe("parseRemotePlaylistPage", () => {
  const playlistHeader = {
    musicResponsiveHeaderRenderer: {
      title: { runs: [{ text: "Late Night Mix" }] },
      straplineTextOne: { runs: [{ text: "Curator Kim" }] },
      subtitle: { runs: [{ text: "Playlist" }, { text: " • " }, { text: "2022" }, { text: " • " }, { text: "Ana" }] },
      secondSubtitle: { runs: [{ text: "1,234 views" }] },
      facepile: { avatarStackViewModel: { text: { content: "Mira" } } },
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: { thumbnails: [{ url: "https://lh3.googleusercontent.com/pl=w226-h226", width: 226, height: 226 }] },
        },
      },
    },
  };

  it("builds the credit line from the header, curator and views, and reads the year", () => {
    const data = {
      header: playlistHeader,
      contents: {
        twoColumnBrowseResultsRenderer: {
          secondaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  musicPlaylistShelfRenderer: {
                    contents: [trackRow({ id: "q1", title: "Q1", noThumb: true })],
                    continuations: [{ nextContinuationData: { continuation: "p2" } }],
                  },
                },
              ],
            },
          },
        },
      },
    };
    const page = parseRemotePlaylistPage(data);

    expect(page.title).toBe("Late Night Mix");
    expect(page.credit).toBe("Mira • Curator Kim • Ana • 1,234 views");
    expect(page.year).toBe("2022");
    expect(page.thumb).toBe("https://lh3.googleusercontent.com/pl=w544-h544");
    expect(page.tracks.map((track) => track.id)).toEqual(["q1"]);
    expect(page.tracks[0].thumb).toBe("https://lh3.googleusercontent.com/pl=w544-h544");
    expect(page.continuation).toBe("p2");
  });

  it("reads the title from the header inside the first section of a two-column page", () => {
    const data = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicEditablePlaylistDetailHeaderRenderer: {
                          header: {
                            musicResponsiveHeaderRenderer: {
                              title: { runs: [{ text: "Top 50 Spotify 2026" }] },
                              subtitle: { runs: [{ text: "Playlist" }] },
                              secondSubtitle: { runs: [{ text: "7.3M views" }] },
                            },
                          },
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

    const page = parseRemotePlaylistPage(data);

    expect(page.title).toBe("Top 50 Spotify 2026");
    expect(page.credit).toBe("7.3M views");
  });

  it("falls back to the default title and an empty credit", () => {
    const page = parseRemotePlaylistPage({});
    expect(page).toMatchObject({ title: "Playlist", credit: "", year: null, thumb: null, tracks: [], continuation: null });
  });
});

describe("parseShelfPage", () => {
  it("reads continuation songs and the next token", () => {
    const page = parseShelfPage({
      continuationContents: {
        musicPlaylistShelfContinuation: {
          contents: [trackRow({ id: "c1", title: "C1" }), trackRow({ id: "c2", title: "C2" })],
          continuations: [{ nextContinuationData: { continuation: "next" } }],
        },
      },
    });
    expect(page.songs.map((song) => song.id)).toEqual(["c1", "c2"]);
    expect(page.continuation).toBe("next");
  });

  it("returns no songs and no token for an empty continuation", () => {
    expect(parseShelfPage({})).toEqual({ songs: [], continuation: null });
  });

  it("reads continuation rows that arrive as appended actions", () => {
    const page = parseShelfPage({
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              trackRow({ id: "c1", title: "C1" }),
              { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "next" } } } },
            ],
          },
        },
      ],
    });
    expect(page.songs.map((song) => song.id)).toEqual(["c1"]);
    expect(page.continuation).toBe("next");
  });
});

describe("uniqueSongs", () => {
  it("keeps the first song for each id", () => {
    const song = (id: string, title: string) => ({
      id,
      title,
      artist: "A",
      thumb: null,
      artistId: null,
      albumId: null,
      album: null,
      duration: 0,
      explicit: false,
      isVideo: false,
    });
    expect(uniqueSongs([song("1", "first"), song("2", "two"), song("1", "again")]).map((item) => item.title)).toEqual([
      "first",
      "two",
    ]);
  });
});

function playlistRow(id: string, extra: Record<string, unknown>) {
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: `Title ${id}` }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Nova" }] } } },
      ],
      thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: "https://x/t=w60", width: 60, height: 60 }] } } },
      ...extra,
    },
  };
}

const fixedDuration = (value: string) => ({
  fixedColumns: [{ musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: value }] } } }],
});

describe("playlist row durations", () => {
  it("reads the duration from fixedColumns on the first page", () => {
    const page = parseRemotePlaylistPage({
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicPlaylistShelfRenderer: { contents: [playlistRow("p1", fixedDuration("4:12"))] } }] } } } }],
        },
      },
    });
    expect(page.tracks[0]).toMatchObject({ id: "p1", duration: 252 });
  });

  it("reads the duration from fixedColumns on continuation rows", () => {
    const page = parseShelfPage({
      continuationContents: {
        musicPlaylistShelfContinuation: { contents: [playlistRow("c1", fixedDuration("1:02:03"))] },
      },
    });
    expect(page.songs[0]).toMatchObject({ id: "c1", duration: 3723 });
  });

  it("falls back to the thumbnail time overlay and lengthText", () => {
    const overlay = playlistRow("o1", {
      thumbnailOverlay: { thumbnailOverlayTimeStatusRenderer: { text: { simpleText: "3:05" } } },
    });
    const length = playlistRow("l1", { lengthText: { runs: [{ text: "2:30" }] } });
    const page = parseShelfPage({
      continuationContents: { musicPlaylistShelfContinuation: { contents: [overlay, length] } },
    });
    expect(page.songs.map((song) => [song.id, song.duration])).toEqual([
      ["o1", 185],
      ["l1", 150],
    ]);
  });
});

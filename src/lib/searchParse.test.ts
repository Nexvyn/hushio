import { describe, expect, it, vi } from "vitest";

vi.mock("youtubei.js", () => ({ Innertube: { create: vi.fn() } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import {
  foldText,
  mergeRows,
  parseSearchPage,
  parseSearchSuggestions,
  searchSections,
  topResult,
  withSearchRows,
  type SearchRow,
  type SuggestionRow,
} from "./searchParse";

const SQUARE = { width: 544, height: 544 };
const WIDE = { width: 1280, height: 720 };
const ART = "https://i.ytimg.com/vi/abc/hqdefault.jpg";

function thumb(size: { width: number; height: number }) {
  return { thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: ART, ...size }] } } } };
}

function runs(segments: string[]) {
  return {
    runs: segments.flatMap((segment, index) => (index === 0 ? [{ text: segment }] : [{ text: " • " }, { text: segment }])),
  };
}

function browseEndpoint(browseId: string, pageType: string | null) {
  return {
    browseId,
    ...(pageType ? { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType } } } : {}),
  };
}

function trackRow(
  id: string,
  title: string,
  segments: string[],
  options: { size?: { width: number; height: number }; fixed?: string; explicit?: boolean } = {},
) {
  return {
    musicResponsiveListItemRenderer: {
      playlistItemData: { videoId: id },
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
        { musicResponsiveListItemFlexColumnRenderer: { text: runs(segments) } },
      ],
      fixedColumns: options.fixed
        ? [{ musicResponsiveListItemFixedColumnRenderer: { text: { simpleText: options.fixed } } }]
        : [],
      ...thumb(options.size ?? SQUARE),
      ...(options.explicit
        ? { badges: [{ musicInlineBadgeRenderer: { icon: { iconType: "MUSIC_EXPLICIT_BADGE" } } }] }
        : {}),
    },
  };
}

function browseRow(browseId: string, title: string, pageType: string | null, subtitle: string) {
  return {
    musicResponsiveListItemRenderer: {
      flexColumns: [
        {
          musicResponsiveListItemFlexColumnRenderer: {
            text: { runs: [{ text: title, navigationEndpoint: { browseEndpoint: browseEndpoint(browseId, pageType) } }] },
          },
        },
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: subtitle }] } } },
      ],
      ...thumb(SQUARE),
    },
  };
}

function artistCard(title: string, browseId: string, subtitle: string) {
  return {
    musicCardShelfRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: runs([subtitle]),
      onTap: { browseEndpoint: browseEndpoint(browseId, "MUSIC_PAGE_TYPE_ARTIST") },
      ...thumb(SQUARE),
    },
  };
}

function songCard(title: string, videoId: string, subtitle: string[]) {
  return {
    musicCardShelfRenderer: {
      title: { runs: [{ text: title }] },
      subtitle: runs(subtitle),
      onTap: { watchEndpoint: { videoId } },
      ...thumb(SQUARE),
    },
  };
}

function suggestion(text: string) {
  return { searchSuggestionRenderer: { suggestion: { runs: [{ text }] } } };
}

function trackId(row: SearchRow | SuggestionRow | undefined): string | undefined {
  if (!row || row.kind === "browse" || row.kind === "completion") return undefined;
  return row.kind === "track" ? row.track.id : row.song.id;
}

describe("parseSearchPage", () => {
  it("reads song rows with artist, duration, artwork and the continuation token", () => {
    const data = {
      contents: [
        trackRow("v1", "Levitating", ["Song", "Dua Lipa", "3:23"], { fixed: "3:23" }),
        { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "NEXT" } } } },
      ],
    };

    const page = parseSearchPage(data, false);

    expect(page.rows).toEqual([
      {
        kind: "track",
        track: {
          id: "v1",
          title: "Levitating",
          artist: "Dua Lipa",
          thumb: ART,
          artistId: null,
          albumId: null,
          album: null,
          duration: 203,
          explicit: false,
          isVideo: false,
        },
      },
    ]);
    expect(page.continuation).toBe("NEXT");
  });

  it("does not read a clock-like artist name as the duration", () => {
    const page = parseSearchPage({ contents: [trackRow("v2", "Interlude", ["Song", "12:00", "2:10"])] }, false);
    const track = page.rows[0];
    expect(track.kind === "track" && track.track.artist).toBe("12:00");
    expect(track.kind === "track" && track.track.duration).toBe(130);
  });

  it("reads artist and album ids from credit links", () => {
    const item = {
      musicResponsiveListItemRenderer: {
        playlistItemData: { videoId: "v3" },
        flexColumns: [
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Track" }] } } },
          {
            musicResponsiveListItemFlexColumnRenderer: {
              text: {
                runs: [
                  { text: "Song" },
                  { text: " • " },
                  { text: "Dua Lipa", navigationEndpoint: { browseEndpoint: browseEndpoint("UC9", "MUSIC_PAGE_TYPE_ARTIST") } },
                  { text: " • " },
                  { text: "Future Nostalgia", navigationEndpoint: { browseEndpoint: browseEndpoint("MPREb9", "MUSIC_PAGE_TYPE_ALBUM") } },
                ],
              },
            },
          },
        ],
        ...thumb(SQUARE),
      },
    };

    const [row] = parseSearchPage({ contents: [item] }, false).rows;

    expect(row).toMatchObject({
      kind: "track",
      track: { artist: "Dua Lipa", artistId: "UC9", album: "Future Nostalgia", albumId: "MPREb9" },
    });
  });

  it("marks non-square artwork as video and keeps it only for the videos filter", () => {
    const data = {
      contents: [
        trackRow("song", "Official Audio", ["Song", "Band"]),
        trackRow("clip", "Official Video", ["Video", "Band"], { size: WIDE }),
      ],
    };

    expect(parseSearchPage(data, false).rows.map(trackId)).toEqual(["song"]);
    expect(parseSearchPage(data, true).rows.map(trackId)).toEqual(["clip"]);
  });

  it("reads explicit badges", () => {
    const [row] = parseSearchPage({ contents: [trackRow("e1", "Loud", ["Song", "Band"], { explicit: true })] }, false).rows;
    expect(row).toMatchObject({ kind: "track", track: { explicit: true } });
  });

  it("turns a song card into the top result and drops video cards", () => {
    const data = {
      contents: [
        songCard("Levitating", "top1", ["Song", "Dua Lipa"]),
        songCard("Clip", "clip1", ["Video", "Dua Lipa"]),
      ],
    };

    const page = parseSearchPage(data, false);

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ kind: "top", song: { id: "top1", title: "Levitating", artist: "Dua Lipa" } });
  });

  it("turns an artist card into a top browse row and ignores cards on the videos filter", () => {
    const data = { contents: [artistCard("Dua Lipa", "UCdua", "Artist")] };

    expect(parseSearchPage(data, false).rows).toEqual([
      {
        kind: "browse",
        top: true,
        item: { type: "artist", browseId: "UCdua", title: "Dua Lipa", subtitle: "Artist", thumb: ART },
      },
    ]);
    expect(parseSearchPage(data, true).rows).toEqual([]);
  });

  it("types browse rows by page type, falling back to UC ids for artists", () => {
    const data = {
      contents: [
        browseRow("MPREa", "Album A", "MUSIC_PAGE_TYPE_ALBUM", "Album • 2020"),
        browseRow("PLx", "Playlist X", "MUSIC_PAGE_TYPE_PLAYLIST", "Playlist"),
        browseRow("UCfallback", "Fallback Artist", null, "Artist"),
        browseRow("MPSPPunknown", "Mystery", null, "Podcast"),
      ],
    };

    const types = parseSearchPage(data, false).rows.map((row) => (row.kind === "browse" ? row.item.type : null));

    expect(types).toEqual(["album", "playlist", "artist", "other"]);
  });

  it("keeps the first row for a repeated video or browse id", () => {
    const data = {
      contents: [
        trackRow("dup", "First", ["Song", "A"]),
        trackRow("dup", "Second", ["Song", "A"]),
        browseRow("UCsame", "Artist", "MUSIC_PAGE_TYPE_ARTIST", "Artist"),
        browseRow("UCsame", "Artist again", "MUSIC_PAGE_TYPE_ARTIST", "Artist"),
      ],
    };

    const page = parseSearchPage(data, false);

    expect(page.rows).toHaveLength(2);
    expect(page.rows[0]).toMatchObject({ kind: "track", track: { title: "First" } });
  });

  it("returns no continuation when the response has none", () => {
    expect(parseSearchPage({ contents: [] }, false)).toEqual({ rows: [], continuation: null });
  });
});

describe("parseSearchSuggestions", () => {
  it("keeps at most three text completions and never the typed query", () => {
    const data = {
      contents: [
        suggestion("dua lipa"),
        suggestion("dua lipa songs"),
        suggestion("dua lipa levitating"),
        suggestion("dua lipa new rules"),
        suggestion("dua lipa radio"),
      ],
    };

    const rows = parseSearchSuggestions(data, "dua lipa");

    expect(rows).toEqual([
      { kind: "completion", text: "dua lipa songs" },
      { kind: "completion", text: "dua lipa levitating" },
      { kind: "completion", text: "dua lipa new rules" },
    ]);
  });

  it("caps rich rows at twelve and drops twins with the same title and artist", () => {
    const items = [
      trackRow("s0", "Song 0", ["Song", "Artist 0"]),
      trackRow("dupe", "song 0", ["Song", "ARTIST 0"]),
      ...Array.from({ length: 19 }, (_, index) => trackRow(`s${index + 1}`, `Song ${index + 1}`, ["Song", `Artist ${index + 1}`])),
    ];

    const rows = parseSearchSuggestions({ contents: items }, "song");

    expect(rows.map(trackId)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11"]);
  });
});

describe("withSearchRows", () => {
  it("keeps completions first, adds search rows and removes repeats", () => {
    const items: SuggestionRow[] = [
      { kind: "completion", text: "dua" },
      { kind: "track", track: { id: "a", title: "A", artist: "X", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false } },
    ];
    const rows: SearchRow[] = [
      { kind: "track", track: { id: "a", title: "A", artist: "X", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false } },
      { kind: "top", song: { id: "b", title: "B", artist: "Y", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false } },
      { kind: "browse", item: { type: "artist", browseId: "UC1", title: "Z", subtitle: "", thumb: null } },
    ];

    const merged = withSearchRows(items, rows);

    expect(merged.map((row) => row.kind)).toEqual(["completion", "track", "track", "browse"]);
    expect(merged[2]).toMatchObject({ kind: "track", track: { id: "b" } });
  });

  it("caps the merged rich rows at twelve", () => {
    const rows: SearchRow[] = Array.from({ length: 15 }, (_, index) => ({
      kind: "browse",
      item: { type: "album", browseId: `MPRE${index}`, title: `Album ${index}`, subtitle: "", thumb: null },
    }));
    expect(withSearchRows([], rows)).toHaveLength(12);
  });
});

describe("topResult and searchSections", () => {
  const song = (id: string) => ({ id, title: id, artist: "A", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false });
  const artist = (id: string, top = false) => ({ kind: "browse" as const, top, item: { type: "artist" as const, browseId: id, title: id, subtitle: "", thumb: null } });

  it("prefers the top song on the All filter and keeps the browse rows in the list", () => {
    const rows: SearchRow[] = [{ kind: "top", song: song("t") }, artist("UC1", true)];
    expect(topResult(rows, "all")).toEqual({ song: song("t"), browse: null, rest: rows });
  });

  it("uses the first top browse card that is not a generic item when there is no top song", () => {
    const other = { kind: "browse" as const, top: true, item: { type: "other" as const, browseId: "X", title: "X", subtitle: "", thumb: null } };
    const rows: SearchRow[] = [other, artist("UC1", true)];
    const result = topResult(rows, "all");
    expect(result.browse?.browseId).toBe("UC1");
    expect(result.rest).toEqual([other]);
  });

  it("shows no top card on the filtered tabs", () => {
    const rows: SearchRow[] = [{ kind: "top", song: song("t") }, artist("UC1", true)];
    expect(topResult(rows, "songs")).toEqual({ song: null, browse: null, rest: rows });
  });

  it("groups the All results into songs, artists, albums, playlists, podcasts and more", () => {
    const rows: SearchRow[] = [
      { kind: "track", track: song("s") },
      artist("UC1"),
      { kind: "browse", item: { type: "album", browseId: "MPRE", title: "Al", subtitle: "", thumb: null } },
      { kind: "browse", item: { type: "playlist", browseId: "PL", title: "Pl", subtitle: "", thumb: null } },
      { kind: "browse", item: { type: "podcast", browseId: "MPSP", title: "Po", subtitle: "", thumb: null } },
      { kind: "browse", item: { type: "other", browseId: "X", title: "Ot", subtitle: "", thumb: null } },
    ];

    expect(searchSections(rows, "all").map((section) => section.title)).toEqual([
      "Songs",
      "Artists",
      "Albums",
      "Playlists",
      "Podcasts",
      "More",
    ]);
  });

  it("returns one untitled list on the other filters and nothing when empty", () => {
    const rows: SearchRow[] = [{ kind: "track", track: song("s") }];
    expect(searchSections(rows, "songs")).toEqual([{ title: null, rows }]);
    expect(searchSections([], "albums")).toEqual([]);
  });
});

describe("row helpers", () => {
  it("merges pages without duplicating rows", () => {
    const first: SearchRow[] = [{ kind: "track", track: { id: "a", title: "A", artist: "X", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false } }];
    const second: SearchRow[] = [
      { kind: "top", song: { id: "a", title: "A", artist: "X", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false } },
      { kind: "browse", item: { type: "artist", browseId: "UC2", title: "B", subtitle: "", thumb: null } },
    ];
    expect(mergeRows(first, second).map((row) => row.kind)).toEqual(["track", "browse"]);
  });

  it("folds text for twin comparison", () => {
    expect(foldText("  Hello WORLD ")).toBe("hello world");
    expect(foldText("Café")).toBe("café");
  });
});

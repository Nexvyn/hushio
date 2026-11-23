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

function withContents(card: { musicCardShelfRenderer: object }, contents: unknown[]) {
  return { musicCardShelfRenderer: { ...card.musicCardShelfRenderer, contents } };
}

function suggestion(text: string) {
  return { searchSuggestionRenderer: { suggestion: { runs: [{ text }] } } };
}

function trackId(row: SearchRow | SuggestionRow | undefined): string | undefined {
  if (!row || row.kind === "browse" || row.kind === "completion") return undefined;
  return row.kind === "track" ? row.track.id : row.song.id;
}

describe("parseSearchPage", () => {
  it("keeps songs with wide or missing artwork dimensions", () => {
    const missing = trackRow("missing", "Missing", ["Song", "Band"]);
    Object.assign(missing.musicResponsiveListItemRenderer, { thumbnail: {} });
    const rows = parseSearchPage({ contents: [missing, trackRow("wide", "Wide", ["Song", "Band"], { size: WIDE })] }, false).rows;
    expect(rows.map(trackId)).toEqual(["missing", "wide"]);
    expect(rows.every((row) => row.kind === "track" && !row.track.isVideo)).toBe(true);
  });

  it("uses the endpoint music type ahead of artwork shape", () => {
    const row = trackRow("audio", "Audio", ["Band"], { size: WIDE });
    Object.assign(row.musicResponsiveListItemRenderer, {
      navigationEndpoint: { watchEndpoint: { videoId: "audio", watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: "MUSIC_VIDEO_TYPE_ATV" } } } },
    });
    expect(parseSearchPage({ contents: [row] }, false).rows.map(trackId)).toEqual(["audio"]);
  });

  it("keeps songs and videos in All and groups videos separately", () => {
    const data = { contents: [trackRow("s", "Song", ["Song", "Band"]), trackRow("v", "Video", ["Video", "Band"], { size: WIDE })] };
    const rows = parseSearchPage(data, "all").rows;
    expect(rows.map(trackId)).toEqual(["s", "v"]);
    expect(searchSections(rows, "all").map((section) => section.title)).toEqual(["Songs", "Videos"]);
  });

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

  it("does not read a duration on a top song card as the artist", () => {
    const [row] = parseSearchPage({ contents: [songCard("Interlude", "top2", ["Song", "3:23"])] }, false).rows;
    expect(row).toMatchObject({ kind: "top", song: { id: "top2", artist: "" } });
  });

  it("keeps both the artist and the duration on a top song card", () => {
    const [row] = parseSearchPage({ contents: [songCard("Levitating", "top3", ["Song", "Dua Lipa", "3:23"])] }, false).rows;
    expect(row).toMatchObject({ kind: "top", song: { id: "top3", artist: "Dua Lipa", duration: 203 } });
  });

  it("reads the top song artist and its id from the credit link", () => {
    const card = {
      musicCardShelfRenderer: {
        title: { runs: [{ text: "Levitating" }] },
        subtitle: {
          runs: [
            { text: "Song" },
            { text: " • " },
            { text: "Dua Lipa", navigationEndpoint: { browseEndpoint: browseEndpoint("UCdua", "MUSIC_PAGE_TYPE_ARTIST") } },
          ],
        },
        onTap: { watchEndpoint: { videoId: "top3" } },
        ...thumb(SQUARE),
      },
    };
    const [row] = parseSearchPage({ contents: [card] }, false).rows;
    expect(row).toMatchObject({ kind: "top", song: { artist: "Dua Lipa", artistId: "UCdua" } });
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

  it("reads album and playlist rows whose browse id sits on the row endpoint", () => {
    const row = {
      musicResponsiveListItemRenderer: {
        flexColumns: [
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Aashiqui 2" }] } } },
          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: "Album" }, { text: " • " }, { text: "Arijit Singh" }] } } },
        ],
        navigationEndpoint: { browseEndpoint: browseEndpoint("MPREb_album", "MUSIC_PAGE_TYPE_ALBUM") },
        ...thumb(SQUARE),
      },
    };

    const page = parseSearchPage({ contents: [row] }, false);

    expect(page.rows).toEqual([
      {
        kind: "browse",
        item: { type: "album", browseId: "MPREb_album", title: "Aashiqui 2", subtitle: "Album • Arijit Singh", thumb: ART },
      },
    ]);
  });

  it("gives songs inside an artist card shelf the card's artist and id", () => {
    const shelf = withContents(artistCard("Arijit Singh", "UCarijit", "Artist"), [
      trackRow("c1", "Ram Lala", ["Song", "6:37"], { fixed: "6:37" }),
      trackRow("c2", "Phir Se", ["Song", "5:55"]),
      trackRow("c3", "Clip", ["Video", "3:00"], { size: WIDE }),
    ]);
    const data = { contents: [shelf] };

    expect(parseSearchPage(data, false).rows).toEqual([
      { kind: "browse", top: true, item: { type: "artist", browseId: "UCarijit", title: "Arijit Singh", subtitle: "Artist", thumb: ART } },
      expect.objectContaining({ kind: "track", track: expect.objectContaining({ id: "c1", artist: "Arijit Singh", artistId: "UCarijit" }) }),
      expect.objectContaining({ kind: "track", track: expect.objectContaining({ id: "c2", artist: "Arijit Singh", artistId: "UCarijit" }) }),
    ]);
    expect(parseSearchPage(data, true).rows).toMatchObject([
      { kind: "track", track: { id: "c3", artist: "Arijit Singh", artistId: "UCarijit", isVideo: true } },
    ]);
  });

  it("keeps the artist a row inside an artist card shelf already names", () => {
    const shelf = withContents(artistCard("Arijit Singh", "UCarijit", "Artist"), [
      trackRow("c4", "Duet", ["Song", "Other Band", "4:00"]),
    ]);

    const page = parseSearchPage({ contents: [shelf] }, false);

    expect(page.rows).toMatchObject([
      { kind: "browse", item: { browseId: "UCarijit" } },
      { kind: "track", track: { id: "c4", artist: "Other Band", artistId: null } },
    ]);
  });

  it("leaves a song row outside any card shelf without an artist", () => {
    const shelf = withContents(artistCard("Arijit Singh", "UCarijit", "Artist"), [trackRow("c5", "Inside", ["Song", "3:00"])]);
    const page = parseSearchPage({ contents: [shelf, trackRow("o1", "Solo", ["Song", "3:00"])] }, false);

    expect(page.rows).toMatchObject([
      { kind: "browse", item: { browseId: "UCarijit" } },
      { kind: "track", track: { id: "c5", artist: "Arijit Singh" } },
      { kind: "track", track: { id: "o1", artist: "", artistId: null } },
    ]);
  });

  it("does not give a song card's artist name to its shelf rows", () => {
    const shelf = withContents(songCard("Levitating", "top9", ["Song", "3:23"]), [trackRow("s9", "Inside", ["Song", "3:00"])]);

    const page = parseSearchPage({ contents: [shelf] }, false);

    expect(page.rows).toMatchObject([
      { kind: "top", song: { id: "top9", artist: "" } },
      { kind: "track", track: { id: "s9", artist: "" } },
    ]);
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
    expect(topResult(rows, "all")).toEqual({ song: song("t"), browse: null, rest: [artist("UC1", true)] });
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

  it("groups the All results into songs, artists, albums, playlists and more", () => {
    const rows: SearchRow[] = [
      { kind: "track", track: song("s") },
      artist("UC1"),
      { kind: "browse", item: { type: "album", browseId: "MPRE", title: "Al", subtitle: "", thumb: null } },
      { kind: "browse", item: { type: "playlist", browseId: "PL", title: "Pl", subtitle: "", thumb: null } },
      { kind: "browse", item: { type: "other", browseId: "X", title: "Ot", subtitle: "", thumb: null } },
    ];

    expect(searchSections(rows, "all").map((section) => section.title)).toEqual([
      "Songs",
      "Artists",
      "Albums",
      "Playlists",
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

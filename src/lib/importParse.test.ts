import { describe, expect, it } from "vitest";
import {
  clock,
  csvCells,
  csvRows,
  durationOf,
  isSpotifyLink,
  isYouTubeLink,
  MAX_SONGS,
  parseSongList,
  parseSongListReport,
  youtubeMixSeed,
  youtubePlaylistId,
} from "./importParse";

describe("parseSongList text mode", () => {
  it("splits Artist - Title lines and drops numbering and comments", () => {
    const songs = parseSongList("1. Dua Lipa - Levitating\n# my notes\n- Tame Impala - The Less I Know\n  \nJust a title");
    expect(songs).toEqual([
      { artist: "Dua Lipa", title: "Levitating", duration: 0 },
      { artist: "Tame Impala", title: "The Less I Know", duration: 0 },
      { artist: "", title: "Just a title", duration: 0 },
    ]);
  });

  it("splits only at the first dash separator", () => {
    expect(parseSongList("A - B - C")).toEqual([{ artist: "A", title: "B - C", duration: 0 }]);
  });

  it("accepts en and em dashes and needs spaces around the separator", () => {
    expect(parseSongList("Artist – Song\nArtist2 — Other")).toEqual([
      { artist: "Artist", title: "Song", duration: 0 },
      { artist: "Artist2", title: "Other", duration: 0 },
    ]);
    expect(parseSongList("Artist - ")).toEqual([{ artist: "", title: "Artist -", duration: 0 }]);
  });

  it("returns nothing for blank input and strips a byte order mark", () => {
    expect(parseSongList("   \n ")).toEqual([]);
    expect(parseSongList("﻿A - B")).toEqual([{ artist: "A", title: "B", duration: 0 }]);
  });

  it("cuts titles and artists at 300 characters", () => {
    const long = "x".repeat(400);
    const [song] = parseSongList(`${long} - ${long}`);
    expect(song.artist).toHaveLength(300);
    expect(song.title).toHaveLength(300);
  });

  it("treats CSV without a title header as plain text lines", () => {
    expect(parseSongList("foo,bar\nbaz,qux")).toEqual([
      { artist: "", title: "foo,bar", duration: 0 },
      { artist: "", title: "baz,qux", duration: 0 },
    ]);
  });
});

describe("parseSongList CSV mode", () => {
  it("reads title, artist and album and joins semicolon artists", () => {
    const songs = parseSongList(
      'Track Name,Artist Name(s),Album Name,Duration (ms)\nLevitating,Dua Lipa; DaBaby,Future Nostalgia,203000\n',
    );
    expect(songs).toEqual([
      { title: "Levitating", artist: "Dua Lipa, DaBaby", album: "Future Nostalgia", duration: 203 },
    ]);
  });

  it("reads clock durations and drops implausible ones", () => {
    const songs = parseSongList("Title,Artist,Length\nA,X,3:45\nB,Y,1:02:03\nC,Z,abc");
    expect(songs.map((song) => song.duration)).toEqual([225, 3723, 0]);
  });

  it("keeps commas inside quoted cells and doubled quotes", () => {
    const songs = parseSongList('title,artist\n"Hello, World","The ""Band"""\n');
    expect(songs).toEqual([{ title: "Hello, World", artist: 'The "Band"', duration: 0 }]);
  });

  it("joins multi-line quoted fields and skips blank rows", () => {
    expect(csvRows('title,artist\n\n"line one\nline two",X\n')).toEqual({
      rows: [
        ["title", "artist"],
        ["line one\nline two", "X"],
      ],
      malformed: 0,
    });
  });

  it("keeps an unclosed quote to its own row and counts that row as malformed", () => {
    const songs = parseSongListReport('title,artist\n"Broken,Nobody\nReal,Someone\nAlso,Real');
    expect(songs.songs.map((song) => song.title)).toEqual(["Real", "Also"]);
    expect(songs.malformed).toBe(1);
  });

  it("reports nothing as malformed when every quote closes", () => {
    expect(parseSongListReport('title,artist\n"A, B",C').malformed).toBe(0);
  });

  it("skips rows with an empty title", () => {
    expect(parseSongList("title,artist\n,Nobody\nReal,Someone").map((song) => song.title)).toEqual(["Real"]);
  });

  it("matches header names case-insensitively", () => {
    const songs = parseSongList("SONG,ARTIST\nOne,Two");
    expect(songs).toEqual([{ title: "One", artist: "Two", duration: 0 }]);
  });
});

describe("parseSongList limits", () => {
  it("returns at most 5000 songs", () => {
    const lines = Array.from({ length: MAX_SONGS + 10 }, (_, index) => `Artist - Song ${index}`).join("\n");
    expect(parseSongList(lines)).toHaveLength(MAX_SONGS);
  });
});

describe("helpers", () => {
  it("recognises playlist links case-insensitively on the trimmed text", () => {
    expect(isSpotifyLink("  https://open.spotify.com/playlist/abc  ")).toBe(true);
    expect(isSpotifyLink("HTTPS://SPOTIFY.LINK/abcdef")).toBe(true);
    expect(isSpotifyLink("spotify:user:someone:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(true);
    expect(isSpotifyLink("Artist - Title")).toBe(false);
  });

  it("reads the list id from every YouTube playlist link shape", () => {
    expect(youtubePlaylistId("https://www.youtube.com/playlist?list=PLabc123_-x")).toBe("PLabc123_-x");
    expect(youtubePlaylistId("https://youtube.com/playlist?list=OLAK5uy_abc")).toBe("OLAK5uy_abc");
    expect(youtubePlaylistId("https://music.youtube.com/playlist?list=PLmusic1")).toBe("PLmusic1");
    expect(youtubePlaylistId("https://m.youtube.com/playlist?list=PLmobile1&si=track")).toBe("PLmobile1");
    expect(youtubePlaylistId("  https://www.youtube.com/playlist?si=x&list=PLfirst  ")).toBe("PLfirst");
    expect(youtubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLwatch1")).toBe("PLwatch1");
    expect(youtubePlaylistId("https://m.youtube.com/watch?list=PLmwatch&v=dQw4w9WgXcQ")).toBe("PLmwatch");
    expect(youtubePlaylistId("https://youtu.be/dQw4w9WgXcQ?list=PLshort1")).toBe("PLshort1");
    expect(youtubePlaylistId("http://youtu.be/dQw4w9WgXcQ?si=abc&list=PLshort2")).toBe("PLshort2");
  });

  it("rejects radio and mix ids that start with RD", () => {
    expect(youtubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ")).toBeNull();
    expect(youtubePlaylistId("https://youtu.be/dQw4w9WgXcQ?list=RDEMabc")).toBeNull();
    expect(youtubePlaylistId("https://music.youtube.com/playlist?list=RDAMVMabc")).toBeNull();
  });

  it("still reads RDCLAK album ids as playlists", () => {
    const album = "RDCLAK5uy_kmPRjHDECIcuVwnKVcg1Vkn1f8VbGPoEY";
    expect(youtubePlaylistId(`https://music.youtube.com/playlist?list=${album}`)).toBe(album);
    expect(youtubeMixSeed(`https://music.youtube.com/playlist?list=${album}`)).toBeNull();
  });

  it("reads the seed video of a YouTube Mix link", () => {
    expect(youtubeMixSeed("https://www.youtube.com/watch?v=7eKJFnvYfOE&list=RD7eKJFnvYfOE&start_radio=1")).toBe(
      "7eKJFnvYfOE",
    );
    expect(youtubeMixSeed("https://music.youtube.com/watch?v=7eKJFnvYfOE&list=RDAMVM7eKJFnvYfOE")).toBe("7eKJFnvYfOE");
    expect(youtubeMixSeed("https://music.youtube.com/watch?list=RDAMVM7eKJFnvYfOE")).toBe("7eKJFnvYfOE");
    expect(youtubeMixSeed("https://youtu.be/7eKJFnvYfOE?list=RDEM7eKJFnvYfOE")).toBe("7eKJFnvYfOE");
    expect(youtubeMixSeed("youtube.com/watch?list=RD7eKJFnvYfOE")).toBe("7eKJFnvYfOE");
  });

  it("returns no mix seed for playlists, radios without a video id and plain links", () => {
    expect(youtubeMixSeed("https://www.youtube.com/playlist?list=PLabc123")).toBeNull();
    expect(youtubeMixSeed("https://www.youtube.com/watch?list=RDxyz")).toBeNull();
    expect(youtubeMixSeed("https://www.youtube.com/watch?v=7eKJFnvYfOE")).toBeNull();
    expect(youtubeMixSeed("Artist - Title")).toBeNull();
  });

  it("recognises any YouTube link, with or without a scheme", () => {
    expect(isYouTubeLink("https://www.youtube.com/watch?v=7eKJFnvYfOE")).toBe(true);
    expect(isYouTubeLink("youtu.be/7eKJFnvYfOE")).toBe(true);
    expect(isYouTubeLink("https://www.youtube.com/watch?v=7eKJFnvYfOE and more")).toBe(false);
    expect(isYouTubeLink("https://notyoutube.com/watch")).toBe(false);
    expect(isYouTubeLink("Artist - Title")).toBe(false);
  });

  it("returns null for YouTube links without a usable playlist", () => {
    expect(youtubePlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubePlaylistId("https://youtu.be/dQw4w9WgXcQ")).toBeNull();
    expect(youtubePlaylistId("https://www.youtube.com/playlist?list=")).toBeNull();
    expect(youtubePlaylistId("https://www.youtube.com/playlist?list=PL a")).toBeNull();
    expect(youtubePlaylistId("https://www.youtube.com/channel?list=PLx")).toBeNull();
    expect(youtubePlaylistId("https://example.com/playlist?list=PLx")).toBeNull();
    expect(youtubePlaylistId("https://notyoutube.com/playlist?list=PLx")).toBeNull();
    expect(youtubePlaylistId("ftp://www.youtube.com/playlist?list=PLx")).toBeNull();
  });

  it("does not treat text or Spotify links as YouTube playlists", () => {
    expect(youtubePlaylistId("Artist - Title")).toBeNull();
    expect(youtubePlaylistId("")).toBeNull();
    expect(youtubePlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(isSpotifyLink("https://www.youtube.com/playlist?list=PLabc")).toBe(false);
  });

  it("parses clock values and rounds durations", () => {
    expect(clock("225")).toBe(225);
    expect(clock("1:02:03")).toBe(3723);
    expect(clock("x:1")).toBe(0);
    expect(durationOf(203.4)).toBe(203);
    expect(durationOf(0)).toBe(0);
    expect(durationOf(86_400)).toBe(0);
    expect(durationOf(Number.NaN)).toBe(0);
  });

  it("splits CSV cells and trims them", () => {
    expect(csvCells(' a , "b,c" ,d')).toEqual(["a", "b,c", "d"]);
  });
});

describe("CSV edge cases", () => {
  it("reads a CSV header that sits behind a byte order mark", () => {
    expect(parseSongList("\uFEFFTitle,Artist\nA,B")).toEqual([{ title: "A", artist: "B", duration: 0 }]);
  });

  it("handles CRLF line endings without leaving carriage returns in cells", () => {
    expect(parseSongList("title,artist,album\r\nA,B,C\r\nD,E,F\r\n")).toEqual([
      { title: "A", artist: "B", album: "C", duration: 0 },
      { title: "D", artist: "E", album: "F", duration: 0 },
    ]);
  });

  it("keeps a row with an empty artist cell instead of dropping it", () => {
    expect(parseSongList("title,artist\nNo artist,\nC,D")).toEqual([
      { title: "No artist", artist: "", duration: 0 },
      { title: "C", artist: "D", duration: 0 },
    ]);
  });

  it("keeps a short row and leaves the missing fields empty", () => {
    expect(parseSongList("title,artist,album,duration (ms)\nSolo")).toEqual([
      { title: "Solo", artist: "", duration: 0 },
    ]);
  });

  it("keeps commas inside a quoted album and joins semicolon artists", () => {
    expect(parseSongList('title,artist,album\n"Song","A; B","Hits, Vol. 1"')).toEqual([
      { title: "Song", artist: "A, B", album: "Hits, Vol. 1", duration: 0 },
    ]);
  });

  it("reads a quoted cell that ends in a comma as one cell", () => {
    expect(csvCells('a,"b,"')).toEqual(["a", "b,"]);
  });

  it("reads the millisecond column in preference to a clock column", () => {
    expect(parseSongList("Title,Length,Track duration (ms)\nA,9:00,61500")).toEqual([
      { title: "A", artist: "", duration: 62 },
    ]);
  });

  it("gives no duration to a millisecond cell that is not a number", () => {
    expect(parseSongList("Title,Duration (ms)\nA,soon")).toEqual([{ title: "A", artist: "", duration: 0 }]);
  });

  it("splits text lines written with CRLF endings", () => {
    expect(parseSongList("A - B\r\n# note\r\nC - D")).toEqual([
      { artist: "A", title: "B", duration: 0 },
      { artist: "C", title: "D", duration: 0 },
    ]);
  });
});

describe("CSV stray quotes", () => {
  it("keeps rows separate when two mid-cell quotes sit on different lines", () => {
    const text = 'title,artist\nSong 12" Mix,Artist\nPlain,Other\nSecond 7" Edit,Band\nLast,Row';
    expect(parseSongListReport(text)).toEqual({
      songs: [
        { title: 'Song 12" Mix', artist: "Artist", duration: 0 },
        { title: "Plain", artist: "Other", duration: 0 },
        { title: 'Second 7" Edit', artist: "Band", duration: 0 },
        { title: "Last", artist: "Row", duration: 0 },
      ],
      malformed: 0,
    });
  });

  it("treats quotes after a closed quoted field as literal text", () => {
    expect(csvCells('"a"b"c",d')).toEqual(['ab"c"', "d"]);
  });

  it("still joins a real multi-line quoted field after a stray quote", () => {
    const text = 'title,artist\nSong 12" Mix,Artist\n"Line one\nline two",Band';
    expect(csvRows(text).rows).toEqual([
      ["title", "artist"],
      ['Song 12" Mix', "Artist"],
      ["Line one\nline two", "Band"],
    ]);
  });

  it("opens a quoted field after leading spaces and keeps doubled quotes inside it", () => {
    expect(csvCells('a,  "say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
  });
});

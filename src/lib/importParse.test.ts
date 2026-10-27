import { describe, expect, it } from "vitest";
import { clock, csvCells, csvRows, durationOf, isPlaylistLink, MAX_SONGS, parseSongList } from "./importParse";

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
    expect(csvRows('title,artist\n\n"line one\nline two",X\n')).toEqual([
      ["title", "artist"],
      ["line one\nline two", "X"],
    ]);
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
    expect(isPlaylistLink("  https://open.spotify.com/playlist/abc  ")).toBe(true);
    expect(isPlaylistLink("HTTPS://SPOTIFY.LINK/abcdef")).toBe(true);
    expect(isPlaylistLink("spotify:user:someone:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(true);
    expect(isPlaylistLink("Artist - Title")).toBe(false);
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

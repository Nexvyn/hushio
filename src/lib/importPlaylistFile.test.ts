import { describe, expect, it } from "vitest";
import { parsePlaylistFile, trackFrom } from "./importPlaylistFile";
import { MAX_SONGS } from "./importParse";

const ID_A = "dQw4w9WgXcQ";
const ID_B = "aaaaaaaaaaa";

describe("parsePlaylistFile JSON", () => {
  it("reads tracks written by the app format", () => {
    const text = JSON.stringify({
      format: "hushio-playlist",
      version: 1,
      name: "  Road trip  ",
      tracks: [{ id: ID_A, title: "Song", artist: "Band", album: "Record", duration: 212.4 }],
    });
    const parsed = parsePlaylistFile(text, "fallback");
    expect(parsed.name).toBe("Road trip");
    expect(parsed.skipped).toBe(0);
    expect(parsed.tracks).toEqual([
      {
        id: ID_A,
        title: "Song",
        artist: "Band",
        thumb: `https://i.ytimg.com/vi/${ID_A}/hqdefault.jpg`,
        duration: 212,
        album: "Record",
      },
    ]);
  });

  it("skips rows with bad ids and keeps the fallback name when none is set", () => {
    const text = JSON.stringify({
      format: "hushio-playlist",
      tracks: [{ id: "short" }, { id: ID_B }, "not a row", { id: 42 }],
    });
    const parsed = parsePlaylistFile(text, "My file");
    expect(parsed.name).toBe("My file");
    expect(parsed.tracks.map((track) => track.id)).toEqual([ID_B]);
    expect(parsed.skipped).toBe(3);
    expect(parsed.tracks[0]).toMatchObject({ title: "Unknown title", artist: "Unknown artist", duration: 0 });
  });

  it("returns nothing for another format, invalid JSON or a missing tracks array", () => {
    expect(parsePlaylistFile('{"format":"other","tracks":[]}', "x")).toEqual({ name: "x", tracks: [], skipped: 0 });
    expect(parsePlaylistFile("{not json", "x")).toEqual({ name: "x", tracks: [], skipped: 0 });
    expect(parsePlaylistFile('{"format":"hushio-playlist"}', "x")).toEqual({ name: "x", tracks: [], skipped: 0 });
  });

  it("stops at the 5000 song limit and counts the rest as skipped", () => {
    const tracks = Array.from({ length: MAX_SONGS + 2 }, () => ({ id: ID_A, title: "t", artist: "a" }));
    const parsed = parsePlaylistFile(JSON.stringify({ format: "hushio-playlist", tracks }), "x");
    expect(parsed.tracks).toHaveLength(MAX_SONGS);
    expect(parsed.skipped).toBe(2);
  });

  it("strips a byte order mark before reading", () => {
    const text = `﻿${JSON.stringify({ format: "hushio-playlist", name: "Bom", tracks: [] })}`;
    expect(parsePlaylistFile(text, "x").name).toBe("Bom");
  });
});

describe("parsePlaylistFile M3U", () => {
  it("reads the playlist name, EXTINF metadata and YouTube links", () => {
    const text = [
      "#EXTM3U",
      "#PLAYLIST:Morning mix",
      "#EXTINF:215,Dua Lipa - Levitating",
      `https://music.youtube.com/watch?v=${ID_A}`,
      "#EXTINF:-1,Solo title",
      `https://youtu.be/${ID_B}`,
    ].join("\n");
    const parsed = parsePlaylistFile(text, "x");
    expect(parsed.name).toBe("Morning mix");
    expect(parsed.tracks).toEqual([
      expect.objectContaining({ id: ID_A, title: "Levitating", artist: "Dua Lipa", duration: 215 }),
      expect.objectContaining({ id: ID_B, title: "Solo title", artist: "Unknown artist", duration: 0 }),
    ]);
    expect(parsed.skipped).toBe(0);
  });

  it("finds ids in shorts links and counts lines without a YouTube id as skipped", () => {
    const text = `#EXTM3U\n/home/me/music/file.mp3\nhttps://www.youtube.com/shorts/${ID_A}\n`;
    const parsed = parsePlaylistFile(text, "x");
    expect(parsed.tracks.map((track) => track.id)).toEqual([ID_A]);
    expect(parsed.skipped).toBe(1);
  });

  it("does not let EXTINF data leak into the next entry", () => {
    const text = `#EXTINF:100,Artist - First\nhttps://music.youtube.com/watch?v=${ID_A}\nhttps://music.youtube.com/watch?v=${ID_B}`;
    const [first, second] = parsePlaylistFile(text, "x").tracks;
    expect(first.title).toBe("First");
    expect(second.title).toBe("Unknown title");
  });

  it("falls back to the file name when #PLAYLIST is empty", () => {
    expect(parsePlaylistFile("#PLAYLIST:   \n", "Backup list").name).toBe("Backup list");
  });
});

describe("trackFrom", () => {
  it("cuts title, artist and album at 300 characters and rounds durations", () => {
    const long = "y".repeat(400);
    const track = trackFrom(ID_A, long, long, 99.6, long);
    expect(track.title).toHaveLength(300);
    expect(track.artist).toHaveLength(300);
    expect(track.album).toHaveLength(300);
    expect(track.duration).toBe(100);
  });

  it("leaves album out when it is not given", () => {
    expect(trackFrom(ID_A, "t", "a", 0)).not.toHaveProperty("album");
  });
});

describe("parsePlaylistFile local files and optional fields", () => {
  it("skips local paths in an M3U8 file and does not pass their EXTINF data on", () => {
    const text = [
      "#EXTM3U",
      "#EXTINF:200,Artist - Local",
      "C:\Music\local.mp3",
      "file:///home/me/track.flac",
      "..\relative\song.m4a",
      `https://music.youtube.com/watch?v=${ID_A}`,
    ].join("\n");
    const parsed = parsePlaylistFile(text, "x");
    expect(parsed.skipped).toBe(3);
    expect(parsed.tracks).toEqual([
      expect.objectContaining({ id: ID_A, title: "Unknown title", artist: "Unknown artist", duration: 0 }),
    ]);
  });

  it("reads M3U8 lines that end in CRLF", () => {
    const parsed = parsePlaylistFile(`#EXTM3U\r\n#PLAYLIST:Win\r\n#EXTINF:100,A - B\r\nhttps://youtu.be/${ID_A}\r\n`, "x");
    expect(parsed.name).toBe("Win");
    expect(parsed.tracks).toEqual([expect.objectContaining({ id: ID_A, title: "B", artist: "A", duration: 100 })]);
  });

  it("cuts a long #PLAYLIST name at 200 characters", () => {
    expect(parsePlaylistFile(`#PLAYLIST:${"n".repeat(250)}`, "x").name).toHaveLength(200);
  });

  it("leaves out an empty album and reads a numeric string duration", () => {
    const parsed = parsePlaylistFile(
      JSON.stringify({
        format: "hushio-playlist",
        tracks: [
          { id: ID_A, title: "A", artist: "B", album: "", duration: "61" },
          { id: ID_B, title: "C", artist: "D" },
        ],
      }),
      "x",
    );
    expect(parsed.tracks[0]).not.toHaveProperty("album");
    expect(parsed.tracks[0].duration).toBe(61);
    expect(parsed.tracks[1]).toMatchObject({ duration: 0 });
    expect(parsed.tracks[1]).not.toHaveProperty("album");
  });

  it("cuts a long JSON name at 200 characters and falls back for a blank or non-text name", () => {
    const named = (name: unknown) => JSON.stringify({ format: "hushio-playlist", name, tracks: [] });
    expect(parsePlaylistFile(named("m".repeat(250)), "x").name).toHaveLength(200);
    expect(parsePlaylistFile(named("   "), "fallback").name).toBe("fallback");
    expect(parsePlaylistFile(named(12), "fallback").name).toBe("fallback");
  });
});

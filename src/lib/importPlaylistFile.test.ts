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

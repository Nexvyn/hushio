import { describe, expect, it } from "vitest";
import { parsePlaylistFile, trackFrom } from "./importPlaylistFile";
import { type ExportTrack, playlistToJson, playlistToM3u8 } from "./playlistFiles";

const ID_A = "dQw4w9WgXcQ";
const ID_B = "aaaaaaaaaaa";

const tracks: ExportTrack[] = [
  { id: ID_A, title: "Never", artist: "Band", album: "Record", duration: 212.4 },
  { id: ID_B, title: "Quiet", artist: "Other", album: null, duration: 0 },
  { id: "local:3f9", title: "Mine", artist: "Me", duration: 90 },
];

describe("M3U8 export", () => {
  it("writes the header, one entry per YouTube track and the rounded durations", () => {
    expect(playlistToM3u8("Road trip", tracks)).toBe(
      [
        "#EXTM3U",
        "#PLAYLIST:Road trip",
        `#EXTINF:212,Band - Never`,
        `https://music.youtube.com/watch?v=${ID_A}`,
        "#EXTINF:-1,Other - Quiet",
        `https://music.youtube.com/watch?v=${ID_B}`,
        "",
      ].join("\n"),
    );
  });

  it("has no local file paths and drops tracks that are not on YouTube", () => {
    const text = playlistToM3u8("Road trip", tracks);
    expect(text).not.toMatch(/file:|local:|[A-Za-z]:\\|\/Users\/|\/home\//);
    expect(text).not.toContain("Mine");
  });

  it("collapses line breaks in the name", () => {
    expect(playlistToM3u8("  a\r\nb  ", [])).toBe("#EXTM3U\n#PLAYLIST:a b\n");
  });

  it("reads back through the playlist parser", () => {
    const parsed = parsePlaylistFile(playlistToM3u8("Road trip", tracks), "fallback");
    expect(parsed.name).toBe("Road trip");
    expect(parsed.tracks.map((track) => track.id)).toEqual([ID_A, ID_B]);
    expect(parsed.tracks[0]).toMatchObject({ title: "Never", artist: "Band", duration: 212 });
  });
});

describe("JSON export", () => {
  it("writes the app format with two-space indentation", () => {
    const doc = JSON.parse(playlistToJson("Road trip", tracks));
    expect(doc).toMatchObject({ format: "hushio-playlist", version: 1, name: "Road trip" });
    expect(doc.tracks).toEqual([
      { id: ID_A, title: "Never", artist: "Band", album: "Record", duration: 212 },
      { id: ID_B, title: "Quiet", artist: "Other" },
    ]);
    expect(playlistToJson("Road trip", tracks)).toContain('\n  "format": "hushio-playlist"');
  });

  it("round-trips a playlist through the parser", () => {
    const parsed = parsePlaylistFile(playlistToJson("Road trip", tracks), "fallback");
    expect(parsed).toEqual({
      name: "Road trip",
      skipped: 0,
      tracks: [
        trackFrom(ID_A, "Never", "Band", 212, "Record"),
        trackFrom(ID_B, "Quiet", "Other", 0),
      ],
    });
  });

  it("exports an empty track list when nothing is shareable", () => {
    expect(JSON.parse(playlistToJson("Only local", [tracks[2]])).tracks).toEqual([]);
  });
});

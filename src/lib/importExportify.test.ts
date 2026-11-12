import { describe, expect, it } from "vitest";
import { parseSongList, parseSongListReport } from "./importParse";

const EXPORT_HEADER =
  "Spotify - id,Artist Name(s),Album Name,Track Name,Track URI,Track Duration (ms),Added At,Explicit,Popularity";

describe("Exportify CSV", () => {
  it("reads title, artists, album and duration from the Exportify headers", () => {
    const text = [
      EXPORT_HEADER,
      "42,Dua Lipa,Future Nostalgia,Levitating,spotify:track:1,203426,2023-01-01T00:00:00Z,false,80",
    ].join("\n");
    expect(parseSongList(text)).toEqual([
      { title: "Levitating", artist: "Dua Lipa", album: "Future Nostalgia", duration: 203 },
    ]);
  });

  it("joins several artists from one quoted cell as A, B", () => {
    const text = [
      "Track URI,Track Name,Album Name,Artist Name(s),Track Duration (ms)",
      'spotify:track:2,Soon You\'ll Get Better,Lover,"Taylor Swift, The Chicks",201586',
      'spotify:track:3,Collab,Album,"A, B, C",180000',
    ].join("\n");
    expect(parseSongList(text)).toEqual([
      { title: "Soon You'll Get Better", artist: "Taylor Swift, The Chicks", album: "Lover", duration: 202 },
      { title: "Collab", artist: "A, B, C", album: "Album", duration: 180 },
    ]);
  });

  it("keeps a track whose title has a comma inside quotes", () => {
    const text = [
      "Track URI,Track Name,Album Name,Artist Name(s),Track Duration (ms)",
      'spotify:track:4,"Hello, World",Demo,Band One,120000',
    ].join("\n");
    expect(parseSongListReport(text)).toEqual({
      songs: [{ title: "Hello, World", artist: "Band One", album: "Demo", duration: 120 }],
      malformed: 0,
    });
  });

  it("leaves the duration at zero when the track has no length", () => {
    const text = ["Track URI,Track Name,Artist Name(s),Track Duration (ms)", "spotify:track:5,Quiet,Someone,"].join("\n");
    expect(parseSongList(text)).toEqual([{ title: "Quiet", artist: "Someone", duration: 0 }]);
  });
});

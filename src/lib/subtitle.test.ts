import { describe, expect, it } from "vitest";
import { joinSubtitle } from "./subtitle";

describe("joinSubtitle", () => {
  it("drops a repeated type label", () => {
    expect(joinSubtitle("Playlist", "Playlist • YouTube Music")).toBe("Playlist");
  });

  it("removes consecutive duplicates case-insensitively", () => {
    expect(joinSubtitle("Playlist", "Playlist • playlist • YouTube Music")).toBe("Playlist");
    expect(joinSubtitle("Song", "Dua Lipa • dua lipa • 2020")).toBe("Song • Dua Lipa • 2020");
  });

  it("drops the YouTube Music author from playlist subtitles", () => {
    expect(joinSubtitle("", "Playlist • YouTube Music")).toBe("Playlist");
  });

  it("keeps artist, song and album subtitles", () => {
    expect(joinSubtitle("Artist", "655M monthly audience")).toBe("Artist • 655M monthly audience");
    expect(joinSubtitle("Song", "Dua Lipa")).toBe("Song • Dua Lipa");
    expect(joinSubtitle("Album", "Arijit Singh")).toBe("Album • Arijit Singh");
  });

  it("returns the label alone when there is no subtitle", () => {
    expect(joinSubtitle("Artist", "")).toBe("Artist");
    expect(joinSubtitle("Artist", undefined)).toBe("Artist");
  });

  it("uses the given separator", () => {
    expect(joinSubtitle("Artist", "Album · 2020", " · ")).toBe("Artist · Album · 2020");
  });

  it("keeps non-consecutive repeats", () => {
    expect(joinSubtitle("Album", "Live • Album • 2020")).toBe("Album • Live • Album • 2020");
  });
});

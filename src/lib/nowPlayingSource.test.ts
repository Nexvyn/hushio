import { describe, expect, it } from "vitest";
import { nowPlayingSourceName } from "./nowPlayingSource";

const none = () => undefined;

describe("nowPlayingSourceName", () => {
  it("falls back to the album when there is no source", () => {
    expect(nowPlayingSourceName(null, "  Album X ", none)).toBe("Album X");
  });

  it("falls back to the album when the source is blank", () => {
    expect(nowPlayingSourceName("   ", "Album Y", none)).toBe("Album Y");
  });

  it("returns an empty string when there is no source and no album", () => {
    expect(nowPlayingSourceName(null, undefined, none)).toBe("");
  });

  it("names the liked songs source", () => {
    expect(nowPlayingSourceName("__liked__", "Album", none)).toBe("Liked Songs");
  });

  it("names the downloads source", () => {
    expect(nowPlayingSourceName("__downloads__", "Album", none)).toBe("Downloads");
  });

  it("returns the playlist name for a playlist id", () => {
    const lookup = (id: string) => (id === "p1" ? "Road Trip" : undefined);
    expect(nowPlayingSourceName("p1", "Album", lookup)).toBe("Road Trip");
  });

  it("returns the raw id when the playlist is unknown", () => {
    expect(nowPlayingSourceName("p2", "Album", none)).toBe("p2");
  });

  it("returns the raw id when the playlist name is empty", () => {
    expect(nowPlayingSourceName("p3", "Album", () => "  ")).toBe("p3");
  });
});

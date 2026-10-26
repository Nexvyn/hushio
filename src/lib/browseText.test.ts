import { describe, expect, it } from "vitest";
import {
  albumMeta,
  artistTitleSize,
  heroCover,
  joinMeta,
  listenersChip,
  pageTitleSize,
  playlistMeta,
  shortTitle,
  subscriberChip,
  titleSource,
  titleStep,
  youtubeAlbumLink,
  youtubePlaylistLink,
} from "./browseText";
import { plural } from "./plural";

describe("titleStep and sizes", () => {
  it("uses the shared name thresholds at their edges", () => {
    expect(titleStep("a".repeat(26))).toBe(0);
    expect(titleStep("a".repeat(27))).toBe(1);
    expect(titleStep("a".repeat(48))).toBe(1);
    expect(titleStep("a".repeat(49))).toBe(2);
  });

  it("picks the page and artist title sizes from the step", () => {
    expect(pageTitleSize("Short")).toBe("text-[34px]");
    expect(pageTitleSize("a".repeat(30))).toBe("text-[28px]");
    expect(pageTitleSize("a".repeat(60))).toBe("text-[24px]");
    expect(artistTitleSize("Nova")).toBe("text-[40px]");
    expect(artistTitleSize("a".repeat(30))).toBe("text-[32px]");
    expect(artistTitleSize("a".repeat(60))).toBe("text-[26px]");
  });
});

describe("shortTitle and titleSource", () => {
  it("drops a trailing bracketed suffix and keeps the full title when nothing is left", () => {
    expect(shortTitle("Night Drive (Deluxe Edition)")).toBe("Night Drive");
    expect(shortTitle("Night Drive [Remastered]")).toBe("Night Drive");
    expect(shortTitle("(Live)")).toBe("(Live)");
    expect(shortTitle("Plain title")).toBe("Plain title");
  });

  it("reads the source from a From suffix", () => {
    expect(titleSource('Theme (From "Film Name")')).toBe("Film Name");
    expect(titleSource("Theme (from Show)")).toBe("Show");
    expect(titleSource("Plain title")).toBeNull();
  });
});

describe("meta lines", () => {
  it("drops empty parts and uppercases the rest", () => {
    expect(joinMeta(["Album", null, "2 tracks", false, ""])).toBe("ALBUM • 2 TRACKS");
  });

  it("builds album and playlist meta with singular and plural track counts", () => {
    expect(albumMeta("Album", "2023", 1)).toBe("ALBUM • 2023 • 1 TRACK");
    expect(albumMeta("Single", null, 12)).toBe("SINGLE • 12 TRACKS");
    expect(playlistMeta("2022", 0)).toBe("PLAYLIST • 2022 • 0 TRACKS");
    expect(playlistMeta(null, 1)).toBe("PLAYLIST • 1 TRACK");
  });

  it("pluralises counts", () => {
    expect(plural(1, "song", "songs")).toBe("1 song");
    expect(plural(3, "song", "songs")).toBe("3 songs");
  });
});

describe("artist chips", () => {
  it("shows the first word of the count followed by a label", () => {
    expect(subscriberChip("1.2M subscribers")).toBe("1.2M subscribers");
    expect(listenersChip("332M monthly listeners")).toBe("332M monthly listeners");
    expect(subscriberChip(null)).toBeNull();
    expect(listenersChip("   ")).toBeNull();
  });
});

describe("links and artwork", () => {
  it("builds YouTube Music album and playlist links", () => {
    expect(youtubeAlbumLink("MPREb_1")).toBe("https://music.youtube.com/browse/MPREb_1");
    expect(youtubePlaylistLink("PLabc")).toBe("https://music.youtube.com/playlist?list=PLabc");
  });

  it("upgrades hero artwork and returns null when there is none", () => {
    expect(heroCover("https://lh3.googleusercontent.com/x=w544-h544")).toBe(
      "https://lh3.googleusercontent.com/x=w1200-h1200",
    );
    expect(heroCover(null)).toBeNull();
    expect(heroCover("http://example.com/x.jpg")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { featuredFrom, phoneSectionStyle } from "./FeedSections";
import type { FeedSection, SectionItem } from "../lib/feed";

function section(overrides: Partial<FeedSection>): FeedSection {
  return { id: "s", kind: "because", title: "Section", layout: "row", priority: 1, items: [], ...overrides } as FeedSection;
}

const albumItem: SectionItem = {
  kind: "album",
  album: { id: "MPREalbum", title: "Shelf album", artist: "Album artist", thumb: null, year: null },
};

const trackItem: SectionItem = {
  kind: "track",
  track: { id: "t1", title: "Shelf song", artist: "Shelf artist", thumb: null },
};

describe("phoneSectionStyle", () => {
  it("picks the tile style for jump back in", () => {
    expect(phoneSectionStyle(section({ kind: "jump-back-in", layout: "tiles" }))).toBe("tile");
  });

  it("picks large cards for playlist shelves and mixes", () => {
    expect(phoneSectionStyle(section({ kind: "playlists-for-you", layout: "crate" }))).toBe("large");
    expect(phoneSectionStyle(section({ kind: "your-mixes", layout: "mixes" }))).toBe("large");
  });

  it("picks the compact two-row grid for album shelves", () => {
    expect(phoneSectionStyle(section({ kind: "albums-for-you", layout: "row" }))).toBe("compact");
    expect(phoneSectionStyle(section({ kind: "market", layout: "yt-shelf", title: "New releases" }))).toBe("compact");
  });

  it("picks round images for artist shelves", () => {
    expect(phoneSectionStyle(section({ kind: "favorite-artists", layout: "circles" }))).toBe("round");
  });

  it("picks song rows for list sections", () => {
    expect(phoneSectionStyle(section({ kind: "heavy-rotation", layout: "list" }))).toBe("songs");
    expect(phoneSectionStyle(section({ kind: "dust-off", layout: "list" }))).toBe("songs");
  });

  it("uses the default card for unknown kinds", () => {
    expect(phoneSectionStyle(section({ kind: "because", layout: "row" }))).toBe("default");
  });
});

describe("featuredFrom", () => {
  it("features the first album of the first album shelf", () => {
    const featured = featuredFrom([section({ kind: "because", items: [trackItem] }), section({ kind: "albums-for-you", items: [albumItem] })]);

    expect(featured).toMatchObject({
      label: "Section",
      title: "Shelf album",
      subtitle: "Album artist",
      source: { type: "album", albumId: "MPREalbum", name: "Shelf album" },
      target: { name: "album", param: "MPREalbum" },
    });
  });

  it("features the first playlist of a playlist shelf", () => {
    const featured = featuredFrom([
      section({
        kind: "playlists-for-you",
        layout: "crate",
        title: "Playlists for you",
        playlists: [{ id: "PLx", title: "Mix one", subtitle: "Playlist", thumb: null }],
      }),
    ]);

    expect(featured).toMatchObject({
      label: "Playlists for you",
      title: "Mix one",
      source: { type: "yt-playlist", playlistId: "PLx", name: "Mix one" },
      target: { name: "ytplaylist", param: "PLx" },
    });
  });

  it("returns null when no shelf starts with an album or playlist", () => {
    expect(featuredFrom([section({ items: [trackItem] })])).toBeNull();
    expect(featuredFrom([])).toBeNull();
  });
});

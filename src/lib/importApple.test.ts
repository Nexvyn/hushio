import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { appleLinkParts, parseApplePage } from "./importApple";

const ART = "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/8e/35/6c/cover.rgb.jpg/{w}x{h}bb.{f}";

const albumServer = {
  data: [
    {
      intent: { $kind: "AlbumDetailPageIntent" },
      data: {
        sections: [
          {
            id: "album-detail-header - 1713845538",
            itemKind: "containerDetailHeaderLockup",
            items: [
              {
                title: "1989 (Taylor's Version) [Deluxe]",
                subtitleLinks: [{ title: "Taylor Swift" }],
                artwork: { dictionary: { url: ART } },
                contentDescriptor: { kind: "album", identifiers: { storeAdamID: "1713845538" } },
              },
            ],
          },
          {
            itemKind: "trackLockup",
            items: [
              {
                title: "Welcome To New York (Taylor's Version)",
                trackNumber: 1,
                duration: 212600,
                artistName: "Taylor Swift",
                artwork: null,
              },
              {
                title: "How You Get The Girl (Taylor's Version)",
                trackNumber: 8,
                duration: 247000,
                artistName: "Taylor Swift",
                artwork: null,
              },
            ],
          },
          {
            itemKind: "squareLockup",
            items: [{ title: "How You Get The Girl (Taylor's Version) [Lyric Video]", duration: 999 }],
          },
        ],
      },
    },
  ],
  userTokenHash: "token",
};

const playlistServer = {
  data: [
    {
      intent: { $kind: "PlaylistDetailPageIntent" },
      data: {
        sections: [
          {
            itemKind: "containerDetailHeaderLockup",
            items: [
              {
                title: "Today’s Hits",
                subtitleLinks: [{ title: "Apple Music Hits" }],
                artwork: { dictionary: { url: ART } },
                contentDescriptor: { kind: "playlist" },
              },
            ],
          },
          {
            itemKind: "trackLockup",
            items: [
              { title: "Choosin' Texas", trackNumber: null, duration: 232226, artistName: "Ella Langley", artwork: null },
              { title: "Been By Now", trackNumber: null, duration: 213806, artistName: "Morgan Wallen", artwork: null },
            ],
          },
          { itemKind: "bubbleLockup", items: [{ title: "Related" }] },
        ],
      },
    },
  ],
  userTokenHash: "token",
};

const albumSchema = {
  "@context": "http://schema.org",
  "@type": "MusicAlbum",
  name: "1989 (Taylor's Version) [Deluxe]",
  byArtist: [{ "@type": "MusicGroup", name: "Taylor Swift" }],
  tracks: [
    { "@type": "MusicRecording", name: "Welcome To New York (Taylor's Version)", duration: "PT3M32S" },
    { "@type": "MusicRecording", name: "Blank Space (Taylor's Version)", duration: "PT3M51S" },
  ],
};

const playlistSchema = {
  "@context": "http://schema.org",
  "@type": "MusicPlaylist",
  name: "Today’s Hits",
  author: { "@type": "Person", name: "Apple Music Hits" },
  track: [{ "@type": "MusicRecording", name: "Choosin' Texas", duration: "PT3M52S" }],
};

function page(serverData: unknown, schema?: unknown): string {
  const server = `<script type="application/json" id="serialized-server-data">${JSON.stringify(serverData)}</script>`;
  const ld = schema
    ? `<script id=schema:music-album type="application/ld+json">${JSON.stringify(schema)}</script>`
    : "";
  return `<html><head>${server}${ld}</head><body></body></html>`;
}

describe("appleLinkParts", () => {
  it("reads a playlist link with a name slug before the id", () => {
    expect(
      appleLinkParts("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb"),
    ).toEqual({ kind: "playlist", id: "pl.f4d106fed2bd41149aaacabb233eb5eb" });
  });

  it("reads a playlist link without a name slug", () => {
    expect(appleLinkParts("https://music.apple.com/us/playlist/pl.abc123")).toEqual({
      kind: "playlist",
      id: "pl.abc123",
    });
  });

  it("ignores the query string", () => {
    expect(appleLinkParts("https://music.apple.com/us/playlist/todays-hits/pl.abc123?l=en-US")).toEqual({
      kind: "playlist",
      id: "pl.abc123",
    });
  });

  it("rejects a playlist link whose last segment is not a playlist id", () => {
    expect(appleLinkParts("https://music.apple.com/us/playlist/todays-hits/not-an-id")).toBeNull();
    expect(appleLinkParts("https://music.apple.com/us/playlist/todays-hits")).toBeNull();
  });

  it("reads an album link", () => {
    expect(appleLinkParts("https://music.apple.com/us/album/1989-taylors-version/1713845538")).toEqual({
      kind: "album",
      id: "1713845538",
    });
  });

  it("reads a link without a storefront", () => {
    expect(appleLinkParts("https://music.apple.com/playlist/pl.abc123")?.kind).toBe("playlist");
  });

  it("rejects a link that is not from Apple Music", () => {
    expect(appleLinkParts("https://open.spotify.com/playlist/abc")).toBeNull();
    expect(appleLinkParts("not a link")).toBeNull();
    expect(appleLinkParts("ftp://music.apple.com/us/playlist/pl.abc")).toBeNull();
  });
});

describe("parseApplePage", () => {
  it("reads the album name, artist, and every track with its duration", () => {
    const collection = parseApplePage(page(albumServer));
    expect(collection.name).toBe("1989 (Taylor's Version) [Deluxe]");
    expect(collection.owner).toBe("Taylor Swift");
    expect(collection.thumb).toBe("https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/8e/35/6c/cover.rgb.jpg/600x600bb.jpg");
    expect(collection.total).toBe(2);
    expect(collection.songs).toEqual([
      expect.objectContaining({
        title: "Welcome To New York (Taylor's Version)",
        artist: "Taylor Swift",
        album: "1989 (Taylor's Version) [Deluxe]",
        duration: 213,
      }),
      expect.objectContaining({ title: "How You Get The Girl (Taylor's Version)", duration: 247 }),
    ]);
  });

  it("reads the playlist name, curator, and each track's own artist", () => {
    const collection = parseApplePage(page(playlistServer));
    expect(collection.name).toBe("Today’s Hits");
    expect(collection.owner).toBe("Apple Music Hits");
    expect(collection.songs.map((song) => [song.title, song.artist, song.duration])).toEqual([
      ["Choosin' Texas", "Ella Langley", 232],
      ["Been By Now", "Morgan Wallen", 214],
    ]);
    expect(collection.songs[0].album).toBeUndefined();
  });

  it("reads the album from the schema markup when the page data is missing", () => {
    const collection = parseApplePage(page({ data: [] }, albumSchema));
    expect(collection.name).toBe("1989 (Taylor's Version) [Deluxe]");
    expect(collection.owner).toBe("Taylor Swift");
    expect(collection.songs).toEqual([
      expect.objectContaining({ title: "Welcome To New York (Taylor's Version)", artist: "Taylor Swift", duration: 212 }),
      expect.objectContaining({ title: "Blank Space (Taylor's Version)", duration: 231 }),
    ]);
  });

  it("reads the playlist from the schema markup when the page data is missing", () => {
    const collection = parseApplePage(page({ data: [] }, playlistSchema));
    expect(collection.name).toBe("Today’s Hits");
    expect(collection.owner).toBe("Apple Music Hits");
    expect(collection.songs[0]).toMatchObject({ title: "Choosin' Texas", duration: 232 });
  });

  it("fails when the page has no readable data", () => {
    expect(() => parseApplePage("<html></html>")).toThrow(/Apple Music changed something/);
  });
});

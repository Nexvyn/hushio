import { beforeEach, describe, expect, it, vi } from "vitest";

const { httpFetch } = vi.hoisted(() => ({ httpFetch: vi.fn() }));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: httpFetch }));

import { isSpotifyLink } from "./importParse";
import { parseAlbumEmbed, parseTrackEmbed, readSpotifyLink, spotifyLinkOf } from "./importSpotify";

const ALBUM_ID = "1NAmidJlEaVgA3MpcPFYGq";
const TRACK_ID = "3n3Ppam7vgaVa1iaRUc9Lp";

const albumEntity = {
  type: "album",
  name: "Lover",
  uri: `spotify:album:${ALBUM_ID}`,
  title: "Lover",
  subtitle: "Taylor Swift",
  visualIdentity: {
    image: [
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02e787cffec20aa2a396a61647", maxWidth: 300, maxHeight: 300 },
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00004851e787cffec20aa2a396a61647", maxWidth: 64, maxHeight: 64 },
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d0000b273e787cffec20aa2a396a61647", maxWidth: 640, maxHeight: 640 },
    ],
  },
  trackList: [
    {
      uri: "spotify:track:43rA71bccXFGD4C8GOpIlN",
      title: "I Forgot That You Existed",
      subtitle: "Taylor Swift",
      isExplicit: false,
      duration: 170640,
    },
    {
      uri: "spotify:track:1BxfuPKGuaTgP7aM0Bbdwr",
      title: "Cruel Summer",
      subtitle: "Taylor Swift",
      isExplicit: false,
      duration: 178426,
    },
    {
      uri: "spotify:track:4AYtqFyFbX0Xkc2wtcygTr",
      title: "Soon You’ll Get Better (feat. The Chicks)",
      subtitle: "Taylor Swift, The Chicks",
      isExplicit: false,
      duration: 201586,
    },
  ],
};

const trackEntity = {
  type: "track",
  name: "Mr. Brightside",
  uri: `spotify:track:${TRACK_ID}`,
  title: "Mr. Brightside",
  artists: [{ name: "The Killers", uri: "spotify:artist:0C0XlULifJtAgn6ZNCW2eu" }],
  duration: 222200,
  isExplicit: false,
  visualIdentity: {
    image: [
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e029c284a6855f4945dc5a3cd73", maxWidth: 300, maxHeight: 300 },
      { url: "https://image-cdn-ak.spotifycdn.com/image/ab67616d0000b2739c284a6855f4945dc5a3cd73", maxWidth: 640, maxHeight: 640 },
    ],
  },
};

function embedHtml(entity: unknown): string {
  const data = { props: { pageProps: { state: { data: { entity }, settings: { session: { accessToken: "" } } } } } };
  return `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

beforeEach(() => {
  httpFetch.mockReset();
});

describe("spotifyLinkOf", () => {
  it("reads album and track links, with intl prefixes, share queries and URIs", () => {
    expect(spotifyLinkOf(`https://open.spotify.com/album/${ALBUM_ID}?si=abc`)).toEqual({ kind: "album", id: ALBUM_ID });
    expect(spotifyLinkOf(`https://open.spotify.com/intl-fr/track/${TRACK_ID}?si=xyz`)).toEqual({
      kind: "track",
      id: TRACK_ID,
    });
    expect(spotifyLinkOf(`spotify:album:${ALBUM_ID}`)).toEqual({ kind: "album", id: ALBUM_ID });
    expect(spotifyLinkOf(`spotify:track:${TRACK_ID}`)).toEqual({ kind: "track", id: TRACK_ID });
  });

  it("rejects artist links, short ids and other hosts", () => {
    expect(spotifyLinkOf(`https://open.spotify.com/artist/${ALBUM_ID}`)).toBeNull();
    expect(spotifyLinkOf("https://open.spotify.com/track/abc")).toBeNull();
    expect(spotifyLinkOf(`https://example.com/track/${TRACK_ID}`)).toBeNull();
  });
});

describe("isSpotifyLink", () => {
  it("accepts album and track links and rejects plain text", () => {
    expect(isSpotifyLink(`https://open.spotify.com/album/${ALBUM_ID}`)).toBe(true);
    expect(isSpotifyLink(`https://open.spotify.com/intl-de/track/${TRACK_ID}?si=1`)).toBe(true);
    expect(isSpotifyLink(`spotify:track:${TRACK_ID}`)).toBe(true);
    expect(isSpotifyLink("Artist - Album")).toBe(false);
  });
});

describe("parseAlbumEmbed", () => {
  it("reads the album name, artist, cover and track list", () => {
    const album = parseAlbumEmbed(embedHtml(albumEntity));
    expect(album.name).toBe("Lover");
    expect(album.owner).toBe("Taylor Swift");
    expect(album.thumb).toBe("https://image-cdn-ak.spotifycdn.com/image/ab67616d0000b273e787cffec20aa2a396a61647");
    expect(album.total).toBe(3);
    expect(album.songs).toEqual([
      {
        spotifyId: "43rA71bccXFGD4C8GOpIlN",
        title: "I Forgot That You Existed",
        artist: "Taylor Swift",
        album: "Lover",
        duration: 171,
        explicit: false,
      },
      {
        spotifyId: "1BxfuPKGuaTgP7aM0Bbdwr",
        title: "Cruel Summer",
        artist: "Taylor Swift",
        album: "Lover",
        duration: 178,
        explicit: false,
      },
      {
        spotifyId: "4AYtqFyFbX0Xkc2wtcygTr",
        title: "Soon You’ll Get Better (feat. The Chicks)",
        artist: "Taylor Swift, The Chicks",
        album: "Lover",
        duration: 202,
        explicit: false,
      },
    ]);
  });

  it("throws when the page has no album entity", () => {
    expect(() => parseAlbumEmbed("<html></html>")).toThrow("That album or song is private or no longer exists.");
  });
});

describe("parseTrackEmbed", () => {
  it("turns a track into a one-song import with joined artists", () => {
    const track = parseTrackEmbed(embedHtml(trackEntity));
    expect(track.name).toBe("Mr. Brightside");
    expect(track.owner).toBe("The Killers");
    expect(track.total).toBe(1);
    expect(track.songs).toEqual([
      { spotifyId: TRACK_ID, title: "Mr. Brightside", artist: "The Killers", duration: 222, explicit: false },
    ]);
  });

  it("joins several track artists with commas", () => {
    const track = parseTrackEmbed(
      embedHtml({
        ...trackEntity,
        artists: [
          { name: "A", uri: "spotify:artist:1" },
          { name: "B", uri: "spotify:artist:2" },
        ],
      }),
    );
    expect(track.songs[0].artist).toBe("A, B");
  });
});

describe("readSpotifyLink for albums and tracks", () => {
  it("fetches the album embed page", async () => {
    httpFetch.mockResolvedValueOnce(new Response(embedHtml(albumEntity), { status: 200 }));
    const album = await readSpotifyLink(`https://open.spotify.com/intl-de/album/${ALBUM_ID}?si=abc`);
    expect(httpFetch).toHaveBeenCalledWith(`https://open.spotify.com/embed/album/${ALBUM_ID}`, expect.anything());
    expect(album.songs).toHaveLength(3);
  });

  it("fetches the track embed page", async () => {
    httpFetch.mockResolvedValueOnce(new Response(embedHtml(trackEntity), { status: 200 }));
    const track = await readSpotifyLink(`spotify:track:${TRACK_ID}`);
    expect(httpFetch).toHaveBeenCalledWith(`https://open.spotify.com/embed/track/${TRACK_ID}`, expect.anything());
    expect(track.songs[0].title).toBe("Mr. Brightside");
  });

  it("explains that a missing album or song is unavailable", async () => {
    httpFetch.mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(readSpotifyLink(`https://open.spotify.com/album/${ALBUM_ID}`)).rejects.toThrow(
      "That album or song is private or no longer exists.",
    );
  });
});

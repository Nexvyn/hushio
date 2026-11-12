import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { httpFetch } = vi.hoisted(() => ({ httpFetch: vi.fn() }));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: httpFetch }));

import {
  isSpotifyShortLink,
  parseEmbedPage,
  readSpotifyLink,
  songOf,
  spotifyPlaylistId,
} from "./importSpotify";

const ID = "37i9dQZF1DXcBWIGoYBM5M";

function embedHtml(data: unknown): string {
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></html>`;
}

const embedData = {
  props: {
    pageProps: {
      state: {
        data: {
          entity: {
            name: "Morning mix",
            subtitle: "Someone",
            coverArt: {
              sources: [
                { url: "https://img/small", width: 64 },
                { url: "https://img/large", width: 640 },
              ],
            },
            trackList: [
              { uri: "spotify:track:t1", title: "One", subtitle: "A, B", duration: 215_000, isExplicit: true },
              { uri: "spotify:track:t2", title: "Two", subtitle: "C", duration: 100_000, isExplicit: false },
              { uri: "spotify:track:t3", title: "", subtitle: "D", duration: 1000 },
            ],
          },
        },
        settings: { session: { accessToken: "anon-token" } },
      },
    },
  },
};

const pathfinderPage = {
  data: {
    playlistV2: {
      name: "Morning mix",
      ownerV2: { data: { name: "Someone" } },
      images: { items: [{ sources: [{ url: "https://img/cover", width: 300 }] }] },
      content: {
        totalCount: 2,
        items: [
          {
            itemV2: {
              data: {
                __typename: "Track",
                uri: "spotify:track:t1",
                name: "One",
                artists: { items: [{ profile: { name: "A" } }, { profile: { name: "B" } }] },
                albumOfTrack: {
                  name: "Album",
                  coverArt: {
                    sources: [
                      { url: "https://img/200", width: 200 },
                      { url: "https://img/640", width: 640 },
                    ],
                  },
                },
                trackDuration: { totalMilliseconds: 215_000 },
                contentRating: { label: "EXPLICIT" },
              },
            },
          },
          {
            itemV2: {
              data: {
                __typename: "Track",
                uri: "spotify:track:t2",
                name: "Two",
                artists: { items: [{ profile: { name: "C" } }] },
                trackDuration: { totalMilliseconds: 100_000 },
              },
            },
          },
          { itemV2: { data: { __typename: "Podcast", name: "Skipped" } } },
        ],
      },
    },
  },
};

function respond(url: string, init?: RequestInit): Response {
  if (url.startsWith("https://open.spotify.com/embed/playlist/")) {
    return new Response(embedHtml(embedData), { status: 200 });
  }
  if (url.startsWith("https://api-partner.spotify.com/pathfinder/v2/query")) {
    expect(JSON.parse(String(init?.body)).operationName).toBe("fetchPlaylist");
    return new Response(JSON.stringify(pathfinderPage), { status: 200 });
  }
  throw new Error(`unexpected request ${url}`);
}

beforeEach(() => {
  httpFetch.mockReset();
  httpFetch.mockImplementation(async (url: string, init?: RequestInit) => respond(url, init));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("link detection", () => {
  it("reads the playlist id from every accepted form", () => {
    expect(spotifyPlaylistId(`https://open.spotify.com/playlist/${ID}?si=abc`)).toBe(ID);
    expect(spotifyPlaylistId(`https://open.spotify.com/intl-de/playlist/${ID}`)).toBe(ID);
    expect(spotifyPlaylistId(`spotify:playlist:${ID}`)).toBe(ID);
    expect(spotifyPlaylistId(`  spotify:user:someone:playlist:${ID}  `)).toBe(ID);
    expect(spotifyPlaylistId(`https://sub.open.spotify.com/playlist/${ID}`)).toBe(ID);
  });

  it("rejects other hosts, other paths and ids of the wrong shape", () => {
    expect(spotifyPlaylistId(`https://example.com/playlist/${ID}`)).toBeNull();
    expect(spotifyPlaylistId(`https://open.spotify.com/album/${ID}`)).toBeNull();
    expect(spotifyPlaylistId("https://open.spotify.com/playlist/short")).toBeNull();
    expect(spotifyPlaylistId(`ftp://open.spotify.com/playlist/${ID}`)).toBeNull();
    expect(spotifyPlaylistId("not a link")).toBeNull();
  });

  it("recognises share links only in the short form", () => {
    expect(isSpotifyShortLink("https://spotify.link/AbC123")).toBe(true);
    expect(isSpotifyShortLink("https://spotify.link/AbC123/")).toBe(true);
    expect(isSpotifyShortLink("https://spotify.link/abc")).toBe(false);
    expect(isSpotifyShortLink(`https://open.spotify.com/playlist/${ID}`)).toBe(false);
  });
});

describe("song conversion", () => {
  it("converts a track and keeps the smallest cover at least 300 px wide", () => {
    const song = songOf(pathfinderPage.data.playlistV2.content.items[0].itemV2.data);
    expect(song).toEqual({
      spotifyId: "t1",
      title: "One",
      artist: "A, B",
      album: "Album",
      duration: 215,
      thumb: "https://img/640",
      explicit: true,
    });
  });

  it("returns null without a title or id and zeroes implausible durations", () => {
    expect(songOf({ name: "", uri: "spotify:track:x" })).toBeNull();
    expect(songOf({ name: "No id" })).toBeNull();
    expect(songOf({ name: "Long", uri: "spotify:track:x", trackDuration: { totalMilliseconds: 90_000_000 } })?.duration).toBe(0);
  });
});

describe("embed page", () => {
  it("reads the name, owner, largest cover, songs and anonymous token", () => {
    const playlist = parseEmbedPage(embedHtml(embedData));
    expect(playlist.name).toBe("Morning mix");
    expect(playlist.owner).toBe("Someone");
    expect(playlist.thumb).toBe("https://img/large");
    expect(playlist.token).toBe("anon-token");
    expect(playlist.total).toBe(2);
    expect(playlist.songs).toEqual([
      { spotifyId: "t1", title: "One", artist: "A, B", duration: 215, explicit: true },
      { spotifyId: "t2", title: "Two", artist: "C", duration: 100, explicit: false },
    ]);
  });

  it("reports a private or missing playlist", () => {
    expect(() => parseEmbedPage("<html></html>")).toThrow("That playlist is private or no longer exists.");
    expect(() => parseEmbedPage(embedHtml({ props: {} }))).toThrow("That playlist is private or no longer exists.");
  });
});

describe("readSpotifyLink", () => {
  it("reads every page of the playlist with the anonymous token", async () => {
    const playlist = await readSpotifyLink(`https://open.spotify.com/playlist/${ID}`);
    expect(playlist.name).toBe("Morning mix");
    expect(playlist.owner).toBe("Someone");
    expect(playlist.total).toBe(2);
    expect(playlist.songs.map((song) => song.title)).toEqual(["One", "Two"]);
    expect(playlist.songs[0]).toMatchObject({ spotifyId: "t1", album: "Album", explicit: true });
    expect(playlist).not.toHaveProperty("token");

    const query = httpFetch.mock.calls.find(([url]) => String(url).includes("pathfinder"));
    expect(query?.[1].headers.Authorization).toBe("Bearer anon-token");
    const body = JSON.parse(String(query?.[1].body));
    expect(body.variables).toMatchObject({ uri: `spotify:playlist:${ID}`, offset: 0, limit: 100 });
  });

  it("keeps the embed songs when the full read fails", async () => {
    httpFetch.mockImplementation(async (url: string) => {
      if (url.includes("pathfinder")) return new Response("oops", { status: 500 });
      return new Response(embedHtml(embedData), { status: 200 });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const playlist = await readSpotifyLink(`spotify:playlist:${ID}`);
    expect(playlist.songs).toHaveLength(2);
    expect(playlist.songs[0]).toMatchObject({ spotifyId: "t1", title: "One" });
    expect(warn).toHaveBeenCalled();
  });

  it("uses the embed alone when the page has no token", async () => {
    const noToken = { ...embedData, props: { pageProps: { state: { data: embedData.props.pageProps.state.data } } } };
    httpFetch.mockImplementation(async () => new Response(embedHtml(noToken), { status: 200 }));
    const playlist = await readSpotifyLink(`spotify:playlist:${ID}`);
    expect(playlist.songs).toHaveLength(2);
    expect(httpFetch).toHaveBeenCalledTimes(1);
  });

  it("reports a missing playlist and other HTTP failures", async () => {
    httpFetch.mockImplementation(async () => new Response("", { status: 404 }));
    await expect(readSpotifyLink(`spotify:playlist:${ID}`)).rejects.toThrow(
      "That playlist is private or no longer exists.",
    );

    httpFetch.mockImplementation(async () => new Response("", { status: 503 }));
    await expect(readSpotifyLink(`spotify:playlist:${ID}`)).rejects.toThrow(
      "Spotify didn't answer (HTTP 503). Try again in a moment.",
    );
  });

  it("rejects text that is not a playlist link", async () => {
    await expect(readSpotifyLink("https://open.spotify.com/track/abc")).rejects.toThrow(
      "That isn't a link to a Spotify playlist, album or song.",
    );
    expect(httpFetch).not.toHaveBeenCalled();
  });

  it("follows a share link through its redirect", async () => {
    httpFetch.mockImplementation(async (url: string) => {
      if (url === "https://spotify.link/AbC123") {
        return new Response(null, { status: 301, headers: { location: `https://open.spotify.com/playlist/${ID}` } });
      }
      return respond(url);
    });
    const playlist = await readSpotifyLink("https://spotify.link/AbC123");
    expect(playlist.name).toBe("Morning mix");
    expect(httpFetch.mock.calls[0][1].redirect).toBe("manual");
  });
});

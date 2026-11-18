import { describe, expect, it } from "vitest";
import {
  appleAlbumId,
  appleBundlePaths,
  appleMotionUrls,
  cleanTitle,
  durationAgrees,
  findCanvasClip,
  lookupCanvasClip,
  matchCommunity,
  parseCommunityManifest,
  pickAppleToken,
  pickTidalVideo,
  playableUrl,
  rankAppleHits,
  splitArtists,
  tidalCoverUrl,
  type CanvasQuery,
  type HttpGet,
} from "./canvasSources";

const blinding: CanvasQuery = {
  id: "src-blinding",
  title: "Blinding Lights",
  artist: "The Weeknd",
  album: "After Hours",
  durationSeconds: 200,
};

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function jwt(header: unknown, payload: unknown): string {
  return `${encode(header)}.${encode(payload)}.c2lnbmF0dXJl`;
}

function fakeHttp(routes: Record<string, string | null>): { http: HttpGet; calls: string[] } {
  const calls: string[] = [];
  const http: HttpGet = async (url) => {
    calls.push(url);
    const prefix = Object.keys(routes).find((key) => url.startsWith(key));
    const body = prefix === undefined ? null : routes[prefix];
    return {
      ok: body !== null,
      status: body === null ? 500 : 200,
      text: async () => body ?? "",
    };
  };
  return { http, calls };
}

describe("text matching", () => {
  it("drops packaging from titles but keeps edition words", () => {
    expect(cleanTitle("Blinding Lights (Official Video)")).toBe("Blinding Lights");
    expect(cleanTitle("Song [Lyrics] | Official Music Video")).toBe("Song");
    expect(cleanTitle("Blinding Lights (Remastered)")).toBe("Blinding Lights (Remastered)");
  });

  it("splits credited artists on the usual separators", () => {
    expect(splitArtists("Dua Lipa feat. Calvin Harris & Ellie Goulding")).toEqual([
      "dua lipa",
      "calvin harris",
      "ellie goulding",
    ]);
  });

  it("accepts a duration within tolerance and rejects one far off", () => {
    expect(durationAgrees(200, 202)).toBe(true);
    expect(durationAgrees(200, 260)).toBe(false);
    expect(durationAgrees(null, 260)).toBe(true);
  });
});

describe("apple music", () => {
  const exact = {
    id: "1",
    attributes: {
      name: "Blinding Lights",
      artistName: "The Weeknd",
      albumName: "After Hours",
      durationInMillis: 200000,
      editorialVideo: { motionDetailSquare: { video: "https://cdn.example/square.mp4" } },
    },
  };

  it("keeps only the right artist, right length and a non-compilation hit", () => {
    const hits = [
      exact,
      { id: "2", attributes: { ...exact.attributes, artistName: "Someone Else" } },
      { id: "3", attributes: { ...exact.attributes, name: "Blinding Lights (Playlist)" } },
      { id: "4", attributes: { ...exact.attributes, durationInMillis: 260000 } },
    ];
    expect(rankAppleHits(hits, blinding).map((hit) => hit.id)).toEqual(["1"]);
  });

  it("orders motion artwork square first and drops duplicates", () => {
    expect(
      appleMotionUrls({
        motionDetailRaw: { video: "https://cdn.example/raw.mp4" },
        motionDetailSquare: { video: "https://cdn.example/square.mp4" },
        motionDetailTall: { hlsUrl: "https://cdn.example/square.mp4" },
      }),
    ).toEqual(["https://cdn.example/square.mp4", "https://cdn.example/raw.mp4"]);
  });

  it("reads the album id from relationships, skipping playlists", () => {
    expect(appleAlbumId({ relationships: { albums: { data: [{ id: "123" }] } } })).toBe("123");
    expect(appleAlbumId({ relationships: { albums: { data: [{ id: "pl.abc" }] } } })).toBeNull();
    expect(appleAlbumId({ attributes: { url: "https://music.apple.com/us/album/after-hours/987?i=5" } })).toBe("987");
  });

  it("finds the web player token by issuer and ignores expired ones", () => {
    const now = Date.UTC(2026, 10, 19);
    const webPlayer = jwt({ alg: "ES256", kid: "WebPlayKid" }, { iss: "AMPWebPlay", exp: now / 1000 + 3600 });
    const other = jwt({ alg: "ES256" }, { iss: "other", exp: now / 1000 + 3600 });
    const expired = jwt({ alg: "ES256", kid: "WebPlayKid" }, { iss: "AMPWebPlay", exp: now / 1000 - 10 });
    const script = `a=${other};b=${expired};c=${webPlayer}`;
    expect(pickAppleToken(script, now)?.token).toBe(webPlayer);
    expect(pickAppleToken(script, now, new Set([webPlayer]))?.token).toBe(other);
  });

  it("finds the bundle scripts the web player page loads", () => {
    const html = '<script src="/assets/index~abc123.js"></script><script src="/assets/index-legacy-x9.js"></script>';
    expect(appleBundlePaths(html)).toEqual(["/assets/index~abc123.js", "/assets/index-legacy-x9.js"]);
  });
});

describe("tidal", () => {
  const root = {
    tracks: {
      items: [
        {
          title: "Blinding Lights (Live)",
          duration: 200,
          artists: [{ name: "The Weeknd" }],
          album: { videoCover: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
        },
        {
          title: "Blinding Lights",
          duration: 200,
          artists: [{ name: "The Weeknd" }],
          album: { videoCover: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
        },
      ],
    },
  };

  it("returns the cover for the exact track and skips other results", () => {
    expect(pickTidalVideo(root, blinding)).toBe(
      "https://resources.tidal.com/videos/a1b2c3d4/e5f6/7890/abcd/ef1234567890/1280x1280.mp4",
    );
  });

  it("rejects a track of the wrong length", () => {
    expect(pickTidalVideo(root, { ...blinding, durationSeconds: 300 })).toBeNull();
  });

  it("refuses cover ids it cannot address", () => {
    expect(tidalCoverUrl("not-a-cover")).toBeNull();
  });
});

describe("community index", () => {
  const entries = parseCommunityManifest({
    items: [
      { song: "Blinding Lights", artist: "The Weeknd", album: "After Hours", url: "https://cdn.example/bl.mp4" },
      { song: "Other", artist: "Someone", url: "https://cdn.example/other.mp4" },
      { song: "Broken" },
    ],
  });

  it("parses only complete entries", () => {
    expect(entries).toHaveLength(2);
  });

  it("matches on containment for titles packaged by contributors", () => {
    expect(matchCommunity(entries, { ...blinding, title: "Blinding Lights (Official Video)" })).toBe(
      "https://cdn.example/bl.mp4",
    );
    expect(matchCommunity(entries, { ...blinding, album: "Something Else" })).toBeNull();
  });
});

describe("playable urls", () => {
  it("skips HLS when the webview cannot play it, and never accepts plain http", () => {
    expect(playableUrl("https://cdn.example/motion.m3u8", false)).toBe(false);
    expect(playableUrl("https://cdn.example/motion.m3u8", true)).toBe(true);
    expect(playableUrl("https://cdn.example/motion.mp4", false)).toBe(true);
    expect(playableUrl("http://cdn.example/motion.mp4", true)).toBe(false);
  });
});

describe("findCanvasClip", () => {
  it("moves past an HLS-only Apple clip to Tidal when HLS is not native", async () => {
    const apple = jwt({ kid: "WebPlayKid" }, { iss: "AMPWebPlay", exp: Date.now() / 1000 + 3600 });
    const { http } = fakeHttp({
      "https://music.apple.com/us/browse": '<script src="/assets/index~t.js"></script>',
      "https://music.apple.com/assets": `var t="${apple}"`,
      "https://amp-api.music.apple.com": JSON.stringify({
        results: {
          songs: {
            data: [
              {
                id: "1",
                attributes: {
                  name: "Blinding Lights",
                  artistName: "The Weeknd",
                  albumName: "After Hours",
                  editorialVideo: { motionDetailSquare: { video: "https://cdn.example/a.m3u8" } },
                },
              },
            ],
          },
        },
      }),
      "https://api.tidal.com": JSON.stringify({
        tracks: {
          items: [
            {
              title: "Blinding Lights",
              artists: [{ name: "The Weeknd" }],
              album: { videoCover: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
            },
          ],
        },
      }),
    });
    const clip = await findCanvasClip({ ...blinding, id: "src-hls" }, { canPlayHls: false, http, now: () => Date.now(), region: "US" });
    expect(clip?.url).toContain("resources.tidal.com/videos/a1b2c3d4");
  });

  it("returns null when nothing answers", async () => {
    const { http } = fakeHttp({});
    const clip = await findCanvasClip({ ...blinding, id: "src-none" }, { canPlayHls: true, http, now: () => Date.now(), region: "US" });
    expect(clip).toBeNull();
  });

  it("caches a hit so a second lookup makes no requests", async () => {
    const { http, calls } = fakeHttp({
      "https://api.tidal.com": JSON.stringify({
        tracks: {
          items: [
            {
              title: "Blinding Lights",
              artists: [{ name: "The Weeknd" }],
              album: { videoCover: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
            },
          ],
        },
      }),
    });
    const options = { canPlayHls: true, http, now: () => Date.now(), region: "US" };
    const query = { ...blinding, id: "src-cache-hit" };
    const first = await lookupCanvasClip(query, options);
    const requests = calls.length;
    const second = await lookupCanvasClip(query, options);
    expect(second).toEqual(first);
    expect(calls.length).toBe(requests);
  });

  it("remembers a miss so a second lookup makes no requests", async () => {
    const { http, calls } = fakeHttp({});
    const options = { canPlayHls: true, http, now: () => Date.now(), region: "US" };
    const query = { ...blinding, id: "src-cache-miss" };
    expect(await lookupCanvasClip(query, options)).toBeNull();
    const requests = calls.length;
    expect(await lookupCanvasClip(query, options)).toBeNull();
    expect(calls.length).toBe(requests);
  });
});

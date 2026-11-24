import { describe, expect, it } from "vitest";
import {
  coverOf,
  listPlaylists,
  playlistOf,
  readPages,
  readSource,
  songOfTrack,
  spotifyStatusText,
  type Getter,
} from "./spotifyLibrary";
import type { SpotifyAccount } from "./bridge";

const DISCONNECTED: SpotifyAccount = {
  ownClientId: null,
  expired: false,
  reconnect: false,
  redirectUri: "http://127.0.0.1/callback",
  configured: true,
  signedIn: false,
  name: null,
};

describe("spotifyStatusText", () => {
  it("shows the account name when connected", () => {
    expect(spotifyStatusText({ ...DISCONNECTED, signedIn: true, name: "Ada" }, false)).toBe("Connected as Ada");
  });

  it("names the account generically when Spotify gave no name", () => {
    expect(spotifyStatusText({ ...DISCONNECTED, signedIn: true }, false)).toBe("Connected as your account");
  });

  it("says it is signing in while the browser flow runs", () => {
    expect(spotifyStatusText(DISCONNECTED, true)).toBe("Signing in. Check your browser.");
  });

  it("says it is disconnected when nothing is stored", () => {
    expect(spotifyStatusText(DISCONNECTED, false)).toBe("Disconnected");
  });

  it("asks for a new sign-in after a refresh failure", () => {
    expect(spotifyStatusText({ ...DISCONNECTED, expired: true }, false)).toBe("Spotify signed you out. Sign in again.");
  });

  it("asks to reconnect when the stored sign-in can't be read", () => {
    expect(spotifyStatusText({ ...DISCONNECTED, reconnect: true }, false)).toBe("Sign in again to reconnect Spotify.");
  });

  it("is empty before the status loads", () => {
    expect(spotifyStatusText(null, false)).toBe("");
  });
});

const PLAYLIST_PAGE_1 = {
  items: [
    {
      id: "pl1",
      name: "Morning mix",
      images: [
        { url: "https://i.test/small.jpg", width: 64 },
        { url: "https://i.test/large.jpg", width: 640 },
      ],
      tracks: { total: 12 },
    },
    null,
  ],
  next: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50",
  total: 2,
};

const PLAYLIST_PAGE_2 = {
  items: [{ id: "pl2", name: "", images: [], items: { total: 3 } }],
  next: null,
  total: 2,
};

const TRACK = {
  id: "4uLU6hMCjMI75M1A2tKUQC",
  name: "  Levitating  ",
  artists: [{ name: "Dua Lipa" }, { name: "DaBaby" }],
  album: {
    name: "Future Nostalgia",
    images: [
      { url: "https://i.test/album-64.jpg", width: 64 },
      { url: "https://i.test/album-300.jpg", width: 300 },
      { url: "https://i.test/album-640.jpg", width: 640 },
    ],
  },
  duration_ms: 203_426,
  explicit: false,
  is_local: false,
};

const LIKED_PAGE_1 = {
  items: [{ added_at: "2026-01-01T00:00:00Z", track: TRACK }, { added_at: "2026-01-02T00:00:00Z", track: null }],
  next: "https://api.spotify.com/v1/me/tracks?offset=50&limit=50",
  total: 3,
};

const LIKED_PAGE_2 = {
  items: [
    {
      added_at: "2026-01-03T00:00:00Z",
      track: { id: null, name: "Local song", artists: [{ name: "Local" }], album: null, duration_ms: 0, is_local: true },
    },
    {
      added_at: "2026-01-04T00:00:00Z",
      track: { id: "2ZkJmCu2AcpZTEB0ZDR2VQ", name: "Dreams", artists: [{ name: "Fleetwood Mac" }], album: { name: "Rumours", images: [] }, duration_ms: 257_000, explicit: true },
    },
  ],
  next: null,
  total: 3,
};

function fixtureGetter(pages: Record<string, unknown>): Getter & { calls: string[] } {
  const calls: string[] = [];
  const get = (async (url: string) => {
    calls.push(url);
    const page = pages[url];
    if (page === undefined) throw new Error(`no fixture for ${url}`);
    return page;
  }) as Getter & { calls: string[] };
  get.calls = calls;
  return get;
}

describe("songOfTrack", () => {
  it("maps a Web API track to the import song shape", () => {
    expect(songOfTrack(TRACK)).toEqual({
      title: "Levitating",
      artist: "Dua Lipa, DaBaby",
      album: "Future Nostalgia",
      duration: 203,
      spotifyId: "4uLU6hMCjMI75M1A2tKUQC",
      thumb: "https://i.test/album-300.jpg",
      explicit: false,
    });
  });

  it("skips local files, episodes, empty titles and missing tracks", () => {
    expect(songOfTrack(null)).toBeNull();
    expect(songOfTrack(undefined)).toBeNull();
    expect(songOfTrack({ ...TRACK, is_local: true })).toBeNull();
    expect(songOfTrack({ ...TRACK, type: "episode" })).toBeNull();
    expect(songOfTrack({ ...TRACK, name: "   " })).toBeNull();
  });

  it("keeps a song without an id and leaves out the empty album and duration", () => {
    const song = songOfTrack({ id: null, name: "Untitled", artists: [], album: null, duration_ms: null });
    expect(song).toEqual({ title: "Untitled", artist: "", duration: 0, thumb: null, explicit: false });
    expect(song).not.toHaveProperty("spotifyId");
    expect(song).not.toHaveProperty("album");
  });
});

describe("coverOf and playlistOf", () => {
  it("prefers the smallest image at least 300 wide, else the largest", () => {
    expect(coverOf([{ url: "a", width: 640 }, { url: "b", width: 300 }, { url: "c", width: 64 }])).toBe("b");
    expect(coverOf([{ url: "a", width: 64 }, { url: "b", width: 128 }])).toBe("b");
    expect(coverOf([])).toBeNull();
    expect(coverOf([{ url: "", width: 640 }])).toBeNull();
  });

  it("maps playlists, falls back to a name for empty titles and reads either count field", () => {
    expect(playlistOf(PLAYLIST_PAGE_1.items[0])).toEqual({
      id: "pl1",
      name: "Morning mix",
      thumb: "https://i.test/large.jpg",
      total: 12,
    });
    expect(playlistOf(PLAYLIST_PAGE_2.items[0])).toEqual({ id: "pl2", name: "Untitled playlist", thumb: null, total: 3 });
    expect(playlistOf(null)).toBeNull();
    expect(playlistOf({ name: "No id" })).toBeNull();
  });
});

describe("pagination", () => {
  it("lists every playlist across pages and drops empty entries", async () => {
    const get = fixtureGetter({
      "https://api.spotify.com/v1/me/playlists?limit=50": PLAYLIST_PAGE_1,
      "https://api.spotify.com/v1/me/playlists?offset=50&limit=50": PLAYLIST_PAGE_2,
    });
    const playlists = await listPlaylists(get);
    expect(playlists.map((playlist) => playlist.id)).toEqual(["pl1", "pl2"]);
    expect(get.calls).toHaveLength(2);
  });

  it("stops at the cap and reports that more songs exist", async () => {
    const get = fixtureGetter({
      "first": { items: [{ track: TRACK }, { track: TRACK }], next: "second", total: 4 },
      second: { items: [{ track: TRACK }, { track: TRACK }], next: "third", total: 4 },
      third: { items: [{ track: TRACK }], next: null, total: 4 },
    });
    const page = await readPages<{ track: typeof TRACK }>("first", get, 3);
    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(4);
    expect(page.truncated).toBe(true);
    expect(get.calls).toEqual(["first", "second"]);
  });

  it("reports a complete read as not truncated", async () => {
    const get = fixtureGetter({ only: { items: [{ track: TRACK }], next: null, total: 1 } });
    const page = await readPages<{ track: typeof TRACK }>("only", get, 10);
    expect(page).toEqual({ items: [{ track: TRACK }], total: 1, truncated: false });
  });
});

describe("readSource", () => {
  it("reads Liked Songs across pages, skipping null and local tracks", async () => {
    const get = fixtureGetter({
      "https://api.spotify.com/v1/me/tracks?limit=50": LIKED_PAGE_1,
      "https://api.spotify.com/v1/me/tracks?offset=50&limit=50": LIKED_PAGE_2,
    });
    const list = await readSource({ kind: "liked" }, get);
    expect(list.name).toBe("Liked Songs");
    expect(list.thumb).toBeNull();
    expect(list.total).toBe(3);
    expect(list.songs.map((song) => song.title)).toEqual(["Levitating", "Dreams"]);
    expect(list.songs[1]).toMatchObject({ explicit: true, spotifyId: "2ZkJmCu2AcpZTEB0ZDR2VQ" });
    expect(list.warning).toBeUndefined();
  });

  it("reads a playlist from the playlist items endpoint and accepts the item field", async () => {
    const get = fixtureGetter({
      "https://api.spotify.com/v1/playlists/pl1/items?limit=50": {
        items: [{ item: TRACK }, { track: null }],
        next: null,
        total: 2,
      },
    });
    const list = await readSource(
      { kind: "playlist", playlist: { id: "pl1", name: "Morning mix", thumb: "https://i.test/large.jpg", total: 2 } },
      get,
    );
    expect(list).toEqual({
      name: "Morning mix",
      thumb: "https://i.test/large.jpg",
      songs: [songOfTrack(TRACK)],
      total: 2,
    });
  });

  it("uses the songs it read when Spotify gives no total", async () => {
    const get = fixtureGetter({ "https://api.spotify.com/v1/me/tracks?limit=50": { items: [{ track: TRACK }], next: null } });
    const list = await readSource({ kind: "liked" }, get);
    expect(list.total).toBe(1);
  });
});

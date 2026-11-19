import { beforeEach, describe, expect, it, vi } from "vitest";

const { pluginFetch } = vi.hoisted(() => ({ pluginFetch: vi.fn() }));

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: pluginFetch }));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { decryptDesEcbBase64, desDecryptBlock, desEncryptBlock, encryptDesEcbBase64 } from "./des";
import {
  isJioSaavnId,
  jioSaavnBitrateFor,
  mapJioSaavnSong,
  resolveJioSaavnStream,
  searchJioSaavnSongs,
} from "./jiosaavn";
import { useSettings } from "../stores/settings";

const MEDIA_KEY = "38346591";
const DECRYPTED = "https://aac.saavncdn.com/abc/def_96.mp4?token=1";

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body, body: null };
}

function probe(status: number) {
  return { ok: status < 400, status, json: async () => ({}), body: { cancel: async () => {} } };
}

const SEARCH_FIXTURE = {
  results: [
    {
      id: "5xceLLNe",
      title: "Tum Hi Ho &amp; More",
      image: "http://c.saavncdn.com/x/150x150.jpg",
      explicit_content: "1",
      more_info: {
        album: "Aashiqui 2",
        album_id: "9999",
        duration: "262",
        encrypted_media_url: "",
        "320kbps": "true",
        artistMap: { primary_artists: [{ id: "1", name: "Arijit Singh" }, { id: "2", name: "Mithoon" }] },
      },
    },
  ],
};

describe("DES", () => {
  it("matches the standard known-answer vector in both directions", () => {
    const key = 0x133457799bbcdff1n;
    const plain = 0x0123456789abcdefn;
    const cipher = 0x85e813540f0ab405n;
    expect(desEncryptBlock(plain, key)).toBe(cipher);
    expect(desDecryptBlock(cipher, key)).toBe(plain);
  });

  it("round-trips padded ECB text with the media key", () => {
    const text = "https://aac.saavncdn.com/some/long/path/track_320.mp4?expires=1700000000&hmac=abc";
    expect(decryptDesEcbBase64(encryptDesEcbBase64(text, MEDIA_KEY), MEDIA_KEY)).toBe(text);
  });
});

describe("JioSaavn mapping", () => {
  it("maps a search row to a prefixed, decoded track", () => {
    const song = mapJioSaavnSong(SEARCH_FIXTURE.results[0]);
    expect(song).toEqual({
      id: "jiosaavn:5xceLLNe",
      title: "Tum Hi Ho & More",
      artist: "Arijit Singh, Mithoon",
      thumb: "https://c.saavncdn.com/x/500x500.jpg",
      album: "Aashiqui 2",
      artistId: null,
      albumId: null,
      duration: 262,
      explicit: true,
      isVideo: false,
    });
  });

  it("drops rows without an id or title", () => {
    expect(mapJioSaavnSong({ id: "", title: "x" })).toBeNull();
    expect(mapJioSaavnSong({ id: "a" })).toBeNull();
  });

  it("routes only jiosaavn ids to JioSaavn", () => {
    expect(isJioSaavnId("jiosaavn:5xceLLNe")).toBe(true);
    expect(isJioSaavnId("dQw4w9WgXcQ")).toBe(false);
    expect(isJioSaavnId("local:abc")).toBe(false);
  });

  it("maps the streaming quality to a JioSaavn rendition", () => {
    expect(jioSaavnBitrateFor(undefined)).toBe(320);
    expect(jioSaavnBitrateFor(256)).toBe(320);
    expect(jioSaavnBitrateFor(128)).toBe(160);
    expect(jioSaavnBitrateFor(48)).toBe(96);
  });
});

describe("JioSaavn requests", () => {
  beforeEach(() => {
    pluginFetch.mockReset();
    useSettings.setState({ jiosaavnEnabled: true });
  });

  it("searches through the public API and maps the results", async () => {
    pluginFetch.mockResolvedValueOnce(json(SEARCH_FIXTURE));
    const songs = await searchJioSaavnSongs("tum hi ho");
    expect(songs).toHaveLength(1);
    expect(songs[0].id).toBe("jiosaavn:5xceLLNe");
    const url = new URL(pluginFetch.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://www.jiosaavn.com/api.php");
    expect(url.searchParams.get("__call")).toBe("search.getResults");
    expect(url.searchParams.get("q")).toBe("tum hi ho");
  });

  function details(supports320: boolean) {
    const encrypted = encryptDesEcbBase64(DECRYPTED, MEDIA_KEY);
    return {
      "5xceLLNe": { more_info: { encrypted_media_url: encrypted, "320kbps": supports320 ? "true" : "false" } },
    };
  }

  it("picks the 320 kbps rendition when the track has one", async () => {
    pluginFetch.mockImplementation(async (url: string) =>
      url.includes("api.php") ? json(details(true)) : probe(206),
    );
    const stream = await resolveJioSaavnStream("jiosaavn:5xceLLNe", undefined);
    expect(stream.url).toBe("https://aac.saavncdn.com/abc/def_320.mp4?token=1");
    expect(stream.kbps).toBe(320);
    expect(stream.mime).toBe("audio/mp4");
  });

  it("picks 160 kbps for medium quality and skips 320 when the track lacks it", async () => {
    pluginFetch.mockImplementation(async (url: string) =>
      url.includes("api.php") ? json(details(false)) : probe(206),
    );
    const stream = await resolveJioSaavnStream("jiosaavn:5xceLLNe", 128);
    expect(stream.url).toBe("https://aac.saavncdn.com/abc/def_160.mp4?token=1");
    expect(stream.kbps).toBe(160);
  });

  it("falls back to the catalogue URL when the 160 kbps rendition does not answer", async () => {
    pluginFetch.mockImplementation(async (url: string) => {
      if (url.includes("api.php")) return json(details(false));
      return probe(url.includes("_160") ? 403 : 206);
    });
    const stream = await resolveJioSaavnStream("jiosaavn:5xceLLNe", 128);
    expect(stream.url).toBe(DECRYPTED);
    expect(stream.kbps).toBe(96);
  });

  it("makes no call and throws when the catalogue is off", async () => {
    useSettings.setState({ jiosaavnEnabled: false });
    await expect(resolveJioSaavnStream("jiosaavn:5xceLLNe", undefined)).rejects.toThrow("turned off");
    expect(pluginFetch).not.toHaveBeenCalled();
  });
});

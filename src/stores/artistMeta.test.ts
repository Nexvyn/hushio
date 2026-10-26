import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import {
  ARTIST_META_FRESH_MS,
  ARTIST_META_MAX,
  artistNameKey,
  peekArtistMeta,
  rememberArtist,
  useArtistMeta,
} from "./artistMeta";

const DAY = 86_400_000;

beforeEach(() => {
  useArtistMeta.setState({ byName: {} });
});

describe("artistNameKey", () => {
  it("trims and lowercases names", () => {
    expect(artistNameKey("  Nova ")).toBe("nova");
  });
});

describe("rememberArtist and peekArtistMeta", () => {
  it("remembers an artist by name and returns it while fresh", () => {
    rememberArtist({ id: "UCnova", name: "Nova", thumb: "https://img/x" }, 1_000);

    expect(peekArtistMeta(" NOVA ", 1_000 + DAY)).toEqual({
      id: "UCnova",
      name: "Nova",
      thumb: "https://img/x",
      resolvedAt: 1_000,
    });
  });

  it("expires entries after 30 days", () => {
    rememberArtist({ id: "UCnova", name: "Nova", thumb: null }, 0);

    expect(peekArtistMeta("Nova", ARTIST_META_FRESH_MS - 1)).not.toBeNull();
    expect(peekArtistMeta("Nova", ARTIST_META_FRESH_MS)).toBeNull();
  });

  it("ignores blank and placeholder names", () => {
    rememberArtist({ id: "UCx", name: "Unknown artist", thumb: null }, 0);
    rememberArtist({ id: "UCy", name: "   ", thumb: null }, 0);

    expect(useArtistMeta.getState().byName).toEqual({});
    expect(peekArtistMeta("Unknown artist", 0)).toBeNull();
    expect(peekArtistMeta("", 0)).toBeNull();
  });

  it("returns null for names it has never seen", () => {
    expect(peekArtistMeta("Nobody", 0)).toBeNull();
  });
});

describe("eviction", () => {
  it("keeps at most 400 entries and drops the oldest first", () => {
    for (let index = 0; index <= ARTIST_META_MAX; index++) {
      rememberArtist({ id: `UC${index}`, name: `Artist ${index}`, thumb: null }, index + 1);
    }

    const keys = Object.keys(useArtistMeta.getState().byName);
    expect(keys).toHaveLength(ARTIST_META_MAX);
    expect(keys).not.toContain("artist 0");
    expect(keys).toContain(`artist ${ARTIST_META_MAX}`);
  });
});

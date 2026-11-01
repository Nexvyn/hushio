import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./browse", () => ({ getArtistPage: vi.fn() }));
vi.mock("./persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { BUNDLE_TTL_MS, type ArtistBundle, bundleFromPage, getArtistBundle, peekBundle } from "./artistBundle";
import { getArtistPage } from "./browse";
import type { ArtistPage } from "./browseParse";
import type { HomeShelf } from "./home";
import { keepNewest, useArtistBundles } from "../stores/artistBundles";
import type { SearchSong } from "./searchParse";

const NOW = Date.UTC(2026, 10, 9, 12);
const getPage = vi.mocked(getArtistPage);

const song = (id: string): SearchSong => ({
  id,
  title: `Song ${id}`,
  artist: "Alpha",
  thumb: null,
  artistId: "UC-a",
  albumId: null,
  album: null,
  duration: 200,
  explicit: false,
  isVideo: false,
});

const albumItem = (id: string) => ({ kind: "album" as const, id, title: `Album ${id}`, artist: "Alpha", thumb: null });
const artistItem = (id: string) => ({ kind: "artist" as const, id, name: `Artist ${id}`, thumb: null });

function pageOf(overrides: Partial<ArtistPage> = {}): ArtistPage {
  const shelves: HomeShelf[] = [
    {
      title: "Albums",
      items: [albumItem("MPRE1"), albumItem("MPRE1"), ...Array.from({ length: 15 }, (_, index) => albumItem(`MPRE${index + 2}`))],
    },
    { title: "Fans also like", items: [artistItem("UC-a"), artistItem("UC-b"), artistItem("UC-b"), ...Array.from({ length: 12 }, (_, index) => artistItem(`UC-${index + 20}`))] },
  ];
  return {
    artist: { id: "UC-a", name: "Alpha", thumb: "alpha.jpg" },
    description: null,
    subscriberCount: null,
    monthlyListeners: null,
    songs: Array.from({ length: 30 }, (_, index) => song(`s${index}`)),
    shelves,
    ...overrides,
  };
}

beforeEach(() => {
  getPage.mockReset();
  useArtistBundles.setState({ bundles: {} });
});

describe("bundleFromPage", () => {
  it("keeps the first 24 songs, 14 unique albums and 12 related artists without the artist itself", () => {
    const bundle = bundleFromPage(pageOf(), NOW);

    expect(bundle.artistId).toBe("UC-a");
    expect(bundle.name).toBe("Alpha");
    expect(bundle.thumb).toBe("alpha.jpg");
    expect(bundle.topSongs).toHaveLength(24);
    expect(bundle.topSongs[0]).toEqual({ id: "s0", title: "Song s0", artist: "Alpha", thumb: null });
    expect(bundle.albums).toHaveLength(14);
    expect(new Set(bundle.albums.map((album) => album.id)).size).toBe(14);
    expect(bundle.related.map((related) => related.id)).toEqual(["UC-b", ...Array.from({ length: 11 }, (_, index) => `UC-${index + 20}`)]);
    expect(bundle.fetchedAt).toBe(NOW);
  });
});

describe("keepNewest", () => {
  it("keeps the 24 most recently fetched bundles", () => {
    const bundles: Record<string, ArtistBundle> = {};
    for (let index = 0; index < 26; index++) {
      const id = `UC-${index}`;
      bundles[id] = { artistId: id, name: id, thumb: null, topSongs: [], albums: [], related: [], fetchedAt: NOW + index };
    }

    const kept = keepNewest(bundles);

    expect(Object.keys(kept)).toHaveLength(24);
    expect(kept["UC-0"]).toBeUndefined();
    expect(kept["UC-1"]).toBeUndefined();
    expect(kept["UC-25"]).toBeDefined();
  });
});

describe("getArtistBundle", () => {
  it("fetches once, then serves the cached bundle while it is fresh", async () => {
    getPage.mockResolvedValue(pageOf());

    const first = await getArtistBundle("UC-a", NOW);
    const second = await getArtistBundle("UC-a", NOW + 1000);

    expect(getPage).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(peekBundle("UC-a")?.name).toBe("Alpha");
  });

  it("fetches again once the cached bundle is older than twelve hours", async () => {
    useArtistBundles.setState({
      bundles: { "UC-a": { artistId: "UC-a", name: "Old", thumb: null, topSongs: [], albums: [], related: [], fetchedAt: NOW } },
    });
    getPage.mockResolvedValue(pageOf());

    const bundle = await getArtistBundle("UC-a", NOW + BUNDLE_TTL_MS);

    expect(getPage).toHaveBeenCalledTimes(1);
    expect(bundle?.name).toBe("Alpha");
  });

  it("returns null and caches nothing when the page fails", async () => {
    getPage.mockRejectedValue(new Error("offline"));

    await expect(getArtistBundle("UC-a", NOW)).resolves.toBeNull();
    expect(peekBundle("UC-a")).toBeNull();
  });

  it("returns null without asking when there is no id", async () => {
    await expect(getArtistBundle("", NOW)).resolves.toBeNull();
    expect(getPage).not.toHaveBeenCalled();
  });
});

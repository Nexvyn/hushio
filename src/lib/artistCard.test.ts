import { beforeEach, describe, expect, it, vi } from "vitest";

const { getArtistPage, cachedSearchPage } = vi.hoisted(() => ({
  getArtistPage: vi.fn(),
  cachedSearchPage: vi.fn(),
}));

vi.mock("./browse", () => ({ getArtistPage }));
vi.mock("./search", () => ({ cachedSearchPage }));
vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { loadArtistCard, resolveArtistRef } from "./artistCard";
import { useArtistMeta } from "../stores/artistMeta";

const page = (id: string) => ({
  artist: { id, name: `Name ${id}`, thumb: "https://img.example/a.jpg" },
  description: "Bio text",
  subscriberCount: "1.2M",
  monthlyListeners: "3.4M",
  songs: [],
  shelves: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  useArtistMeta.setState({ byName: {} });
});

describe("loadArtistCard", () => {
  it("loads the artist page once per artist id", async () => {
    getArtistPage.mockImplementation(async (id: string) => page(id));

    const first = await loadArtistCard("UCcard1");
    const second = await loadArtistCard("UCcard1");

    expect(getArtistPage).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(first).toEqual({
      id: "UCcard1",
      name: "Name UCcard1",
      thumb: "https://img.example/a.jpg",
      description: "Bio text",
      subscriberCount: "1.2M",
      monthlyListeners: "3.4M",
    });
  });

  it("retries after a failed load", async () => {
    getArtistPage.mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(async (id: string) => page(id));

    await expect(loadArtistCard("UCcard2")).rejects.toThrow("offline");
    await expect(loadArtistCard("UCcard2")).resolves.toMatchObject({ id: "UCcard2" });
    expect(getArtistPage).toHaveBeenCalledTimes(2);
  });
});

describe("resolveArtistRef", () => {
  it("uses the artist already remembered by name without searching", async () => {
    useArtistMeta.getState().put({ id: "UCknown", name: "Known Act", thumb: null, resolvedAt: Date.now() });

    await expect(resolveArtistRef("Known Act")).resolves.toEqual({ id: "UCknown", thumb: null });
    expect(cachedSearchPage).not.toHaveBeenCalled();
  });

  it("searches for an unknown artist and remembers the match", async () => {
    cachedSearchPage.mockResolvedValue({
      rows: [
        { kind: "browse", item: { type: "artist", browseId: "UCfound", title: "New Band", subtitle: "", thumb: null } },
        { kind: "browse", item: { type: "artist", browseId: "UCother", title: "Other", subtitle: "", thumb: null } },
      ],
      continuation: null,
    });

    await expect(resolveArtistRef("new band")).resolves.toEqual({ id: "UCfound", thumb: null });
    expect(cachedSearchPage).toHaveBeenCalledWith("new band", "artists");
    expect(useArtistMeta.getState().byName["new band"]?.id).toBe("UCfound");
  });

  it("returns null when the search has no artist with that name", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [], continuation: null });

    await expect(resolveArtistRef("Nobody Here")).resolves.toBeNull();
  });

  it("falls back to the first listed artist when the joined name has no match", async () => {
    cachedSearchPage.mockImplementation(async (query: string) =>
      query === "Afusic"
        ? { rows: [{ kind: "browse", item: { type: "artist", browseId: "UCafusic", title: "Afusic", subtitle: "", thumb: null } }], continuation: null }
        : { rows: [], continuation: null },
    );

    await expect(resolveArtistRef("Afusic & AliSoomroMusic")).resolves.toEqual({ id: "UCafusic", thumb: null });
  });

  it("does not split a name that only contains the letter x", async () => {
    cachedSearchPage.mockResolvedValue({ rows: [], continuation: null });

    await expect(resolveArtistRef("Max Richter")).resolves.toBeNull();
    expect(cachedSearchPage).toHaveBeenCalledTimes(1);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../types";

const lyricsGet = vi.hoisted(() => vi.fn());

vi.mock("./bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge")>()),
  lyricsGet,
}));

const track = (id: string): Track => ({ id, title: `Title ${id}`, artist: `Artist ${id}`, thumb: null });
const synced = { synced: [{ time: 1, text: "Line" }], plain: null, source: "Test", wordSynced: false };

async function load() {
  return import("./lyrics");
}

describe("requestLyrics", () => {
  beforeEach(() => {
    vi.resetModules();
    lyricsGet.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
  });

  it("sends the track fields and leaves a zero duration unset", async () => {
    lyricsGet.mockResolvedValue(synced);
    const { requestLyrics } = await load();
    await requestLyrics(track("a"));
    expect(lyricsGet).toHaveBeenCalledWith({ id: "a", title: "Title a", artist: "Artist a", duration: undefined });
    await requestLyrics(track("b"), 215);
    expect(lyricsGet).toHaveBeenLastCalledWith({ id: "b", title: "Title b", artist: "Artist b", duration: 215 });
  });

  it("reuses the cached answer for the same track", async () => {
    lyricsGet.mockResolvedValue(synced);
    const { requestLyrics } = await load();
    const first = await requestLyrics(track("a"));
    const second = await requestLyrics(track("a"));
    expect(second).toBe(first);
    expect(lyricsGet).toHaveBeenCalledTimes(1);
  });

  it("does not cache a miss and retries only after the 30 s backoff", async () => {
    lyricsGet.mockResolvedValueOnce(null).mockResolvedValue(synced);
    const { requestLyrics, LYRICS_RETRY_MS } = await load();

    expect(await requestLyrics(track("a"))).toBeNull();
    expect(await requestLyrics(track("a"))).toBeNull();
    expect(lyricsGet).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(LYRICS_RETRY_MS);
    expect(await requestLyrics(track("a"))).toEqual(synced);
    expect(lyricsGet).toHaveBeenCalledTimes(2);
  });

  it("treats an empty answer as a miss", async () => {
    lyricsGet.mockResolvedValueOnce({ synced: [], plain: "  ", source: "", wordSynced: false });
    const { requestLyrics } = await load();
    expect(await requestLyrics(track("a"))).toBeNull();
  });

  it("turns a rejected lookup into a miss", async () => {
    lyricsGet.mockRejectedValueOnce(new Error("offline"));
    const { requestLyrics } = await load();
    await expect(requestLyrics(track("a"))).resolves.toBeNull();
  });

  it("keeps plain text as a hit", async () => {
    const plainOnly = { synced: null, plain: "Words only", source: "Plain", wordSynced: false };
    lyricsGet.mockResolvedValue(plainOnly);
    const { requestLyrics } = await load();
    expect(await requestLyrics(track("a"))).toEqual(plainOnly);
    await requestLyrics(track("a"));
    expect(lyricsGet).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entry beyond 24 tracks", async () => {
    lyricsGet.mockResolvedValue(synced);
    const { requestLyrics, LYRICS_CACHE_LIMIT } = await load();
    for (let i = 0; i <= LYRICS_CACHE_LIMIT; i++) await requestLyrics(track(`t${i}`));
    expect(lyricsGet).toHaveBeenCalledTimes(LYRICS_CACHE_LIMIT + 1);

    await requestLyrics(track(`t${LYRICS_CACHE_LIMIT}`));
    expect(lyricsGet).toHaveBeenCalledTimes(LYRICS_CACHE_LIMIT + 1);

    await requestLyrics(track("t0"));
    expect(lyricsGet).toHaveBeenCalledTimes(LYRICS_CACHE_LIMIT + 2);
  });
});

describe("prefetchLyrics", () => {
  beforeEach(() => {
    vi.resetModules();
    lyricsGet.mockReset();
    lyricsGet.mockResolvedValue(synced);
  });

  it("starts a lookup that the next request reuses", async () => {
    const { prefetchLyrics, requestLyrics } = await load();
    prefetchLyrics(track("warm"));
    expect(lyricsGet).toHaveBeenCalledTimes(1);
    expect(await requestLyrics(track("warm"))).toEqual(synced);
    expect(lyricsGet).toHaveBeenCalledTimes(1);
  });
});

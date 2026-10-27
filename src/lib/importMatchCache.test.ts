import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchSong } from "./searchParse";

const { persistRead, persistWrite } = vi.hoisted(() => ({
  persistRead: vi.fn(async (): Promise<unknown> => null),
  persistWrite: vi.fn(async (): Promise<boolean> => true),
}));

vi.mock("./bridge", () => ({ persistRead, persistWrite }));

const DAY = 24 * 60 * 60 * 1000;

function track(id: string): SearchSong {
  return { id, title: id, artist: "a", thumb: null, album: null, duration: 0, explicit: false, isVideo: false, artistId: null, albumId: null };
}

async function freshCache() {
  vi.resetModules();
  return import("./importMatchCache");
}

beforeEach(() => {
  persistRead.mockReset();
  persistRead.mockResolvedValue(null);
  persistWrite.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("match cache expiry", () => {
  it("keeps a found match for 30 days and a miss for 1 day", async () => {
    const cache = await freshCache();
    cache.writeMatch("found", track("f"), 0);
    cache.writeMatch("missed", null, 0);
    expect(cache.readMatch("found", 29 * DAY)?.id).toBe("f");
    expect(cache.readMatch("found", 31 * DAY)).toBeUndefined();
    expect(cache.readMatch("missed", DAY - 1)).toBeNull();
    expect(cache.readMatch("missed", DAY)).toBeUndefined();
  });

  it("returns undefined for keys it has never seen", async () => {
    const cache = await freshCache();
    expect(cache.readMatch("unknown")).toBeUndefined();
  });

  it("evicts the oldest entries beyond 5000", async () => {
    const cache = await freshCache();
    for (let index = 0; index <= cache.MAX_REMEMBERED; index += 1) {
      cache.writeMatch(`k${index}`, null, 0);
    }
    expect(cache.readMatch("k0", 0)).toBeUndefined();
    expect(cache.readMatch(`k${cache.MAX_REMEMBERED}`, 0)).toBeNull();
    expect(cache.readMatch("k1", 0)).toBeNull();
  });

  it("moves a rewritten key to the newest position", async () => {
    const cache = await freshCache();
    cache.writeMatch("first", null, 0);
    for (let index = 1; index < cache.MAX_REMEMBERED; index += 1) cache.writeMatch(`k${index}`, null, 0);
    cache.writeMatch("first", null, 0);
    cache.writeMatch("extra", null, 0);
    expect(cache.readMatch("first", 0)).toBeNull();
    expect(cache.readMatch("k1", 0)).toBeUndefined();
  });
});

describe("match cache storage", () => {
  it("loads saved entries and skips malformed ones", async () => {
    persistRead.mockResolvedValue({ good: { t: null, at: 5 }, bad: "nope" });
    const cache = await freshCache();
    await cache.loadMatchCache();
    expect(persistRead).toHaveBeenCalledWith("track-matches", "guest");
    expect(cache.readMatch("good", 6)).toBeNull();
    expect(cache.readMatch("bad", 6)).toBeUndefined();
  });

  it("writes once, two seconds after the last change", async () => {
    const cache = await freshCache();
    vi.useFakeTimers();
    cache.writeMatch("a", null, 0);
    vi.advanceTimersByTime(1500);
    cache.writeMatch("b", track("b"), 0);
    vi.advanceTimersByTime(1999);
    expect(persistWrite).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(persistWrite).toHaveBeenCalledTimes(1);
    expect(persistWrite).toHaveBeenCalledWith(
      "track-matches",
      { a: { t: null, at: 0 }, b: { t: track("b"), at: 0 } },
      "guest",
    );
  });

  it("keeps working when the saved cache cannot be read", async () => {
    persistRead.mockRejectedValue(new Error("disk gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = await freshCache();
    await expect(cache.loadMatchCache()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disk gone"));
    warn.mockRestore();
  });
});

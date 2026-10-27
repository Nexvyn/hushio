import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportSong } from "./importParse";
import type { SearchSong } from "./searchParse";

const { searchPage, persistRead, persistWrite } = vi.hoisted(() => ({
  searchPage: vi.fn(),
  persistRead: vi.fn(async (): Promise<unknown> => null),
  persistWrite: vi.fn(async (): Promise<boolean> => true),
}));

vi.mock("./search", () => ({ searchPage }));
vi.mock("./bridge", () => ({ persistRead, persistWrite }));

import {
  bestMatch,
  languageOf,
  matchCacheKey,
  matchScore,
  matchSong,
  searchQueries,
  similarity,
  titleWords,
  versionMarks,
} from "./importMatch";

function candidate(id: string, title: string, artist: string, options: { album?: string | null; duration?: number } = {}): SearchSong {
  return {
    id,
    title,
    artist,
    thumb: null,
    album: options.album ?? null,
    duration: options.duration ?? 200,
    explicit: false,
    isVideo: false,
    artistId: null,
    albumId: null,
  };
}

const target = (overrides: Partial<ImportSong> = {}): ImportSong => ({
  title: "Blinding Lights",
  artist: "The Weeknd",
  duration: 200,
  ...overrides,
});

beforeEach(() => {
  searchPage.mockReset();
  searchPage.mockResolvedValue({ rows: [], continuation: null });
  persistRead.mockClear();
  persistWrite.mockClear();
});

describe("normalisation", () => {
  it("removes bracket groups and dash tails from titles", () => {
    expect(titleWords("Blinding Lights (Official Video)")).toBe("blinding lights");
    expect(titleWords("Song - Radio Edit")).toBe("song");
  });

  it("keeps only version words, lower-cased, sorted and without hyphens", () => {
    expect(versionMarks("Song (Lo-Fi Remix)")).toBe("lofi remix");
    expect(versionMarks("Song (Live)")).toBe("live");
    expect(versionMarks("Song")).toBe("");
  });

  it("scores character bigram similarity between 0 and 1", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "abd")).toBe(0.5);
    expect(similarity("a", "ab")).toBe(0);
    expect(similarity("ab", "cd")).toBe(0);
  });

  it("finds the first language word in a title", () => {
    expect(languageOf("Kaise Hua (Hindi)")).toBe("hindi");
    expect(languageOf("Malayalam Ballad Tamil")).toBe("tamil");
    expect(languageOf("Plain title")).toBeNull();
  });
});

describe("search queries", () => {
  it("searches with the first artist and the title, then the title alone", () => {
    expect(searchQueries(target({ artist: "Dua Lipa, DaBaby", title: "Levitating" }))).toEqual([
      "Levitating Dua Lipa",
      "Levitating",
    ]);
  });

  it("keeps version words from brackets in the first query", () => {
    expect(searchQueries(target({ artist: "A & B", title: "Song (Remix)" }))).toEqual([
      "Song Remix A",
      "Song (Remix)",
    ]);
  });
});

describe("matchScore gates", () => {
  it("rejects a candidate whose version marks differ", () => {
    expect(matchScore(target({ title: "Song (Remix)" }), candidate("1", "Song", "The Weeknd"), "")).toBeNull();
  });

  it("rejects a candidate whose title is too different", () => {
    expect(matchScore(target({ title: "Blinding Lights" }), candidate("1", "Completely other", "The Weeknd"), "")).toBeNull();
  });

  it("rejects a candidate more than 15 seconds away in length", () => {
    expect(matchScore(target({ duration: 200 }), candidate("1", "Blinding Lights", "The Weeknd", { duration: 230 }), "")).toBeNull();
  });

  it("rejects a same-title song by a different artist", () => {
    expect(matchScore(target({ artist: "Alice" }), candidate("1", "Blinding Lights", "Bob", { duration: 200 }), "")).toBeNull();
  });

  it("accepts a candidate when the length is unknown", () => {
    expect(matchScore(target({ duration: 0 }), candidate("1", "Blinding Lights", "The Weeknd", { duration: 999 }), "")).not.toBeNull();
  });
});

describe("matchScore ranking", () => {
  it("adds points for the artist and for a close length", () => {
    const score = matchScore(target({ artist: "Alice", duration: 200 }), candidate("1", "Blinding Lights", "Alice", { duration: 200 }), "");
    expect(score).toBe(160);
  });

  it("adds points for the same album", () => {
    const plain = matchScore(target({ album: "After Hours", duration: 0 }), candidate("1", "Blinding Lights", "The Weeknd", { album: "Other" }), "");
    const same = matchScore(target({ album: "After Hours", duration: 0 }), candidate("2", "Blinding Lights", "The Weeknd", { album: "After Hours" }), "");
    expect((same ?? 0) - (plain ?? 0)).toBe(10);
  });

  it("prefers the requested language and penalises a different one", () => {
    const hindi = candidate("h", "Kaise (Hindi)", "Arijit");
    const tamil = candidate("t", "Kaise (Tamil)", "Arijit");
    const plain = candidate("p", "Kaise", "Arijit");
    const pick = { title: "Kaise", artist: "Arijit", duration: 0 };
    const hindiScore = matchScore(pick, hindi, "hindi") ?? 0;
    expect(hindiScore - (matchScore(pick, tamil, "hindi") ?? 0)).toBe(55);
    expect(hindiScore - (matchScore(pick, plain, "hindi") ?? 0)).toBe(15);
    expect(matchScore(pick, plain, "")).toBe(matchScore(pick, hindi, ""));
  });
});

describe("bestMatch", () => {
  it("picks the highest score and ignores candidates without an id", () => {
    const close = candidate("close", "Blinding Lights", "The Weeknd", { duration: 200 });
    const far = candidate("far", "Blinding Lights", "The Weeknd", { duration: 210 });
    const noId = candidate("", "Blinding Lights", "The Weeknd", { duration: 200 });
    expect(bestMatch(target(), [far, noId, close], "")?.id).toBe("close");
  });

  it("returns null when nothing passes the gates", () => {
    expect(bestMatch(target(), [candidate("x", "Other", "Someone")], "")).toBeNull();
  });
});

describe("cache keys", () => {
  it("uses the Spotify id when there is one, else title, artist and length, lower-cased", () => {
    expect(matchCacheKey({ title: "A", artist: "B", duration: 0, spotifyId: "ABC" }, "")).toBe("sp:abc");
    expect(matchCacheKey({ title: "Song", artist: "Band", duration: 180 }, "")).toBe("t:song|band|180");
    expect(matchCacheKey({ title: "Song", artist: "Band", duration: 180 }, "tamil")).toBe("t:song|band|180|tamil");
  });
});

describe("matchSong", () => {
  it("tries the second query when the first finds nothing", async () => {
    const hit = candidate("v1", "Unique Track", "Some Artist", { duration: 180 });
    searchPage.mockResolvedValueOnce({ rows: [], continuation: null });
    searchPage.mockResolvedValueOnce({ rows: [{ kind: "track", track: hit }], continuation: null });

    const found = await matchSong({ title: "Unique Track", artist: "Some Artist", duration: 180 }, "");
    expect(found?.id).toBe("v1");
    expect(searchPage).toHaveBeenCalledTimes(2);
    expect(searchPage.mock.calls[0][1]).toBe("songs");
  });

  it("uses top results as candidates too", async () => {
    const top = candidate("top1", "Top Track", "Top Artist", { duration: 180 });
    searchPage.mockResolvedValueOnce({ rows: [{ kind: "top", song: top }], continuation: null });
    expect((await matchSong({ title: "Top Track", artist: "Top Artist", duration: 180 }, ""))?.id).toBe("top1");
  });

  it("remembers a miss so the same song is not searched again", async () => {
    const song = { title: "Nobody Has This", artist: "Nobody", duration: 99 };
    expect(await matchSong(song, "")).toBeNull();
    const calls = searchPage.mock.calls.length;
    expect(await matchSong(song, "")).toBeNull();
    expect(searchPage.mock.calls.length).toBe(calls);
  });

  it("remembers a found match and returns it without a search", async () => {
    const hit = candidate("cached1", "Remembered", "Band", { duration: 150 });
    searchPage.mockResolvedValueOnce({ rows: [{ kind: "track", track: hit }], continuation: null });
    const song = { title: "Remembered", artist: "Band", duration: 150 };
    await matchSong(song, "");
    searchPage.mockClear();
    expect((await matchSong(song, ""))?.id).toBe("cached1");
    expect(searchPage).not.toHaveBeenCalled();
  });

  it("does not remember a failed search, so the next call tries again", async () => {
    searchPage.mockRejectedValueOnce(new Error("offline"));
    const song = { title: "Flaky Song", artist: "Band", duration: 120 };
    await expect(matchSong(song, "")).rejects.toThrow("offline");
    searchPage.mockResolvedValueOnce({ rows: [{ kind: "track", track: candidate("ok", "Flaky Song", "Band", { duration: 120 }) }], continuation: null });
    expect((await matchSong(song, ""))?.id).toBe("ok");
  });

  it("ignores an unknown language preference", async () => {
    const song = { title: "Plain Unknown", artist: "X", duration: 0 };
    expect(await matchSong(song, "klingon")).toBeNull();
    searchPage.mockClear();
    expect(await matchSong(song, "")).toBeNull();
    expect(searchPage).not.toHaveBeenCalled();
  });
});

describe("preference order", () => {
  it("picks the same title and artist over a live or remix version", () => {
    const best = bestMatch(target({ duration: 200 }), [
      candidate("live", "Blinding Lights (Live)", "The Weeknd", { duration: 200 }),
      candidate("remix", "Blinding Lights - Remix", "The Weeknd", { duration: 200 }),
      candidate("plain", "Blinding Lights", "The Weeknd", { duration: 200 }),
    ], "");
    expect(best?.id).toBe("plain");
  });

  it("keeps a remix target on the remix by the same artist", () => {
    const best = bestMatch(target({ title: "Blinding Lights (Remix)", duration: 200 }), [
      candidate("other", "Blinding Lights (Remix)", "Someone Else", { duration: 200 }),
      candidate("live-remix", "Blinding Lights (Live Remix)", "The Weeknd", { duration: 200 }),
      candidate("same", "Blinding Lights (Remix)", "The Weeknd", { duration: 200 }),
    ], "");
    expect(best?.id).toBe("same");
  });

  it("gives more credit when more of the target's artists match", () => {
    const pick = target({ artist: "Alice, Bob", duration: 200 });
    expect(matchScore(pick, candidate("1", "Blinding Lights", "Alice", { duration: 200 }), "")).toBe(155);
    expect(matchScore(pick, candidate("2", "Blinding Lights", "Alice, Bob", { duration: 200 }), "")).toBe(160);
  });

  it("splits the first artist at x and feat", () => {
    expect(searchQueries(target({ artist: "Alpha x Beta", title: "Duo" }))).toEqual(["Duo Alpha", "Duo"]);
    expect(searchQueries(target({ artist: "Dua Lipa feat Someone", title: "Duo" }))).toEqual(["Duo Dua Lipa", "Duo"]);
  });

  it("keeps a version word from a dash tail in the first query", () => {
    expect(searchQueries(target({ artist: "A", title: "Song - Live" }))).toEqual(["Song Live A", "Song - Live"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  artistsInLine,
  backToBack,
  computeTasteProfile,
  dustOff,
  fadedCount,
  heavyRotation,
  isEarlyExit,
  latelyByArtist,
  maturityOf,
  outcomeOf,
  pairKey,
  rankByTaste,
  type JournalEntry,
  type ProfileInput,
  type StatsSummary,
  type VotedEntry,
  votesOf,
} from "./taste";
import type { Track } from "../types";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 9, 12);

const track = (id: string, artist = "Artist", title = `Song ${id}`): Track => ({ id, title, artist, thumb: null });
const journal = (id: string, artist: string, at: number, heard: number): JournalEntry => ({ track: track(id, artist), at, heard });
const voted = (id: string, artist: string, at: number, out: VotedEntry["out"]): VotedEntry => ({
  ...journal(id, artist, at, 0),
  out,
});

const emptySummary: StatsSummary = { plays: 0, artists: [], tracks: [], hours: [] };

function inputOf(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    all: emptySummary,
    month: emptySummary,
    history: [],
    liked: [],
    playlists: [],
    searches: [],
    skips: {},
    followed: [],
    journal: [],
    hiddenArtists: {},
    durations: {},
    now: NOW,
    resolveArtist: () => null,
    ...overrides,
  };
}

describe("outcomeOf and isEarlyExit", () => {
  it("records nothing for a click-through under four seconds", () => {
    expect(outcomeOf(3, 200)).toBeNull();
  });

  it("marks a long track left early as a skip", () => {
    expect(isEarlyExit(10, 200)).toBe(true);
    expect(outcomeOf(10, 200)).toBe("skip");
  });

  it("does not call a track a skip when the length is unknown or short", () => {
    expect(isEarlyExit(10, 0)).toBe(false);
    expect(isEarlyExit(10, 25)).toBe(false);
    expect(outcomeOf(10, 25)).toBe("part");
  });

  it("calls a listen done at 70 percent of a long track", () => {
    expect(outcomeOf(100, 200)).toBe("part");
    expect(outcomeOf(140, 200)).toBe("done");
  });

  it("uses 120 seconds as the full mark when the length is unknown", () => {
    expect(outcomeOf(119, 0)).toBe("part");
    expect(outcomeOf(120, 0)).toBe("done");
  });
});

describe("votesOf", () => {
  it("drops click-throughs and reads durations from the given map", () => {
    const votes = votesOf(
      [journal("a", "X", NOW, 3), journal("b", "X", NOW, 140), journal("c", "X", NOW, 10)],
      { b: 200, c: 200 },
    );

    expect(votes.map((entry) => [entry.track.id, entry.out])).toEqual([
      ["b", "done"],
      ["c", "skip"],
    ]);
  });
});

describe("latelyByArtist", () => {
  it("adds votes with a three-day half-life and ignores unknown artists", () => {
    const votes = [
      voted("a", "Lo-Fi", NOW, "done"),
      voted("b", "lo-fi", NOW - 3 * DAY, "done"),
      voted("c", "Unknown Artist", NOW, "done"),
      voted("d", "   ", NOW, "done"),
    ];

    const scores = latelyByArtist(votes, NOW);

    expect([...scores.keys()]).toEqual(["lo-fi"]);
    expect(scores.get("lo-fi")).toBeCloseTo(1.5, 6);
  });
});

describe("latelyByArtist weighting", () => {
  it("weighs a play from yesterday above one from 60 days ago", () => {
    const scores = latelyByArtist([voted("a", "Yesterday", NOW - DAY, "done"), voted("b", "Old", NOW - 60 * DAY, "done")], NOW);
    expect(scores.get("yesterday") ?? 0).toBeGreaterThan(scores.get("old") ?? 0);
  });

  it("returns an empty map for no votes", () => {
    expect(latelyByArtist([], NOW).size).toBe(0);
  });
});

describe("heavyRotation", () => {
  it("keeps tracks with two or more listens and a positive score, newest metadata first", () => {
    const votes = [
      { ...voted("a", "X", NOW - DAY, "done"), track: track("a", "X", "Newest title") },
      voted("a", "X", NOW - 2 * DAY, "part"),
      voted("a", "X", NOW - 3 * DAY, "done"),
      voted("b", "X", NOW - DAY, "done"),
      voted("c", "X", NOW - DAY, "skip"),
      voted("c", "X", NOW - 2 * DAY, "skip"),
      voted("d", "X", NOW - DAY, "done"),
      voted("d", "X", NOW - DAY, "skip"),
      voted("old", "X", NOW - 30 * DAY, "done"),
      voted("old", "X", NOW - 31 * DAY, "done"),
    ];

    const rows = heavyRotation(votes, NOW);

    expect(rows.map((row) => row.track.id)).toEqual(["a"]);
    expect(rows[0].track.title).toBe("Newest title");
    expect(rows[0].listens).toBe(3);
    expect(rows[0].score).toBeGreaterThan(0);
  });

  it("orders by score, then by listens", () => {
    const votes = [
      voted("low", "X", NOW, "done"),
      voted("low", "X", NOW, "done"),
      voted("high", "X", NOW, "done"),
      voted("high", "X", NOW, "done"),
      voted("high", "X", NOW, "done"),
    ];

    expect(heavyRotation(votes, NOW).map((row) => row.track.id)).toEqual(["high", "low"]);
  });
});

describe("dustOff", () => {
  it("returns tracks with enough plays that rested for three weeks and are not in recent listening", () => {
    const rows = [
      { track: track("x"), plays: 5, lastAt: NOW - 30 * DAY },
      { track: track("v"), plays: 3, lastAt: NOW - 22 * DAY },
      { track: track("y"), plays: 2, lastAt: NOW - 30 * DAY },
      { track: track("z"), plays: 4, lastAt: NOW - 5 * DAY },
      { track: track("w"), plays: 9, lastAt: NOW - 40 * DAY },
    ];

    const result = dustOff(rows, { played: new Set(["w"]), skipped: new Set() }, NOW);

    expect(result.map((row) => row.track.id)).toEqual(["x", "v"]);
  });
});

describe("backToBack", () => {
  it("counts consecutive listens by different artists within 30 minutes, without skips", () => {
    const votes = [
      voted("1", "a", 0, "done"),
      voted("2", "b", 10 * 60_000, "done"),
      voted("3", "b", 60 * 60_000, "done"),
      voted("4", "c", 65 * 60_000, "skip"),
      voted("5", "c", 66 * 60_000, "done"),
      voted("6", "c", 67 * 60_000, "done"),
    ];

    expect([...backToBack(votes).entries()]).toEqual([[pairKey("a", "b"), 1]]);
  });
});

describe("artistsInLine and rankByTaste", () => {
  it("splits credits and drops view counts", () => {
    expect(artistsInLine("Artist A, Artist B & More")).toEqual(["artist a", "artist b"]);
    expect(artistsInLine("Foo feat. Bar")).toEqual(["foo", "bar"]);
    expect(artistsInLine("1.2M views")).toEqual([]);
  });

  it("orders items by how much their artists match the taste affinity", () => {
    const items = [{ subtitle: "Beta" }, { subtitle: "Gamma" }, { subtitle: "Alpha" }];
    const affinity = new Map([
      ["alpha", 1],
      ["beta", 0.5],
    ]);

    expect(rankByTaste(items, affinity).map((item) => item.subtitle)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(rankByTaste(items, new Map())).toEqual(items);
  });
});

describe("fadedCount and maturityOf", () => {
  it("fades a stored count over its half-life and maps plays to maturity", () => {
    expect(fadedCount(undefined, NOW, 10 * DAY)).toBe(0);
    expect(fadedCount({ n: 2, at: NOW - 10 * DAY }, NOW, 10 * DAY)).toBeCloseTo(1, 6);
    expect([0, 1, 24, 25, 99, 100].map(maturityOf)).toEqual(["cold", "light", "light", "warmed", "warmed", "strong"]);
  });
});

describe("computeTasteProfile", () => {
  it("returns an empty cold profile when there is no history", () => {
    const profile = computeTasteProfile(inputOf());

    expect(profile.maturity).toBe("cold");
    expect(profile.totalPlays).toBe(0);
    expect(profile.artists).toEqual([]);
    expect(profile.lately).toEqual([]);
    expect(profile.heavyRotation).toEqual([]);
    expect(profile.dustOff).toEqual([]);
    expect(profile.hourEnergy).toBe(0);
  });

  const warm: StatsSummary = {
    plays: 120,
    artists: [
      { name: "Alpha", ms: 3_000_000, plays: 60 },
      { name: "Beta", ms: 1_000_000, plays: 20 },
    ],
    tracks: [{ id: "t1", title: "Known", artist: "Alpha", thumb: null, ms: 1_000_000, plays: 4 }],
    hours: new Array<number>(24).fill(0),
  };
  const monthly: StatsSummary = {
    plays: 30,
    artists: [{ name: "Alpha", ms: 1_000_000, plays: 10 }],
    tracks: [{ id: "t1", title: "Known", artist: "Alpha", thumb: null, ms: 1_000_000, plays: 4 }],
    hours: new Array<number>(24).fill(0),
  };
  const resolveArtist = (name: string) => (name === "Alpha" ? { artistId: "UC-alpha", thumb: null } : null);

  it("scores artists from listening, likes, follows and searches and sorts by score", () => {
    const profile = computeTasteProfile(
      inputOf({
        all: warm,
        month: monthly,
        liked: [track("l1", "Gamma")],
        followed: [{ id: "UC-beta", name: "Beta" }],
        searches: ["alp"],
        resolveArtist,
      }),
    );

    expect(profile.artists.map((artist) => artist.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(profile.artists[0].score).toBeCloseTo(70.6, 6);
    expect(profile.artists[0].artistId).toBe("UC-alpha");
    expect(profile.artists[1].artistId).toBe("UC-beta");
    expect(profile.totalPlays).toBe(121);
    expect(profile.maturity).toBe("strong");
  });

  it("does not count library plays for artists the stats already know", () => {
    const profile = computeTasteProfile(inputOf({ all: warm, month: monthly, history: [track("h1", "Alpha")], resolveArtist }));

    expect(profile.totalPlays).toBe(120);
  });

  it("counts library plays for artists missing from the stats", () => {
    const profile = computeTasteProfile(inputOf({ all: warm, month: monthly, history: [track("h2", "Delta")], resolveArtist }));

    expect(profile.totalPlays).toBe(121);
    expect(profile.artists.map((artist) => artist.key)).toContain("delta");
  });

  it("turns recent journal listens into lately artists", () => {
    const profile = computeTasteProfile(
      inputOf({
        all: warm,
        month: monthly,
        journal: [journal("j1", "Alpha", NOW - HOUR, 100)],
        resolveArtist,
      }),
    );

    expect(profile.lately.map((artist) => artist.name)).toEqual(["Alpha"]);
    expect(profile.lately[0].lately).toBeCloseTo(0.5, 1);
    expect(profile.artists[0].lastPlayedAt).toBe(NOW - HOUR);
  });

  it("fills heavy rotation from month tracks when the journal has too few rows", () => {
    const profile = computeTasteProfile(inputOf({ all: warm, month: monthly, resolveArtist }));

    expect(profile.heavyRotation.map((row) => [row.track.id, row.listens, row.score])).toEqual([["t1", 4, 0]]);
  });

  it("reads the local hour's energy relative to the busiest hour", () => {
    const hours = new Array<number>(24).fill(0);
    hours[new Date(NOW).getHours()] = 5;
    hours[(new Date(NOW).getHours() + 1) % 24] = 10;
    const profile = computeTasteProfile(inputOf({ month: { ...monthly, hours } }));

    expect(profile.hourEnergy).toBeCloseTo(0.5, 6);
  });
});

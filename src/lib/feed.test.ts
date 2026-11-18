import { describe, expect, it } from "vitest";
import type { AlbumRef, ArtistBundle } from "./artistBundle";
import {
  buildHomeSections,
  cratePlaylists,
  diversify,
  type FeedInput,
  type FeedSection,
  hourAwareTodayTitle,
  tasteAffinity,
} from "./feed";
import type { HomeShelf } from "./home";
import { type ArtistScore, type Maturity, type TasteProfile } from "./taste";
import type { Track } from "../types";

const HOUR = 3_600_000;
const NOW = new Date(2026, 10, 9, 15).getTime();

const track = (id: string, artist = "Artist", title = `Song ${id}`): Track => ({ id, title, artist, thumb: null });

const artistScore = (artistId: string, name: string, score: number, lastPlayedAt: number | null = null): ArtistScore => ({
  key: name.toLowerCase(),
  name,
  artistId,
  thumb: null,
  score,
  lately: 0,
  lastPlayedAt,
});

const bundle = (
  artistId: string,
  name: string,
  topSongs: Track[],
  related: string[] = [],
  albums: AlbumRef[] = [],
): ArtistBundle => ({
  artistId,
  name,
  thumb: null,
  topSongs,
  albums,
  related: related.map((id) => ({ id, name: id, thumb: null })),
  fetchedAt: NOW,
});

const album = (id: string, title: string, year: string | null): AlbumRef => ({
  id,
  title,
  artist: "Alpha",
  thumb: null,
  year,
});

function profileOf(overrides: Partial<TasteProfile> = {}): TasteProfile {
  return {
    daySeed: 1234,
    totalPlays: 0,
    maturity: "cold" as Maturity,
    artists: [],
    lately: [],
    heavyRotation: [],
    dustOff: [],
    pairs: new Map(),
    topTracks: [],
    playedTrackIds: new Set(),
    recentlyPlayed: [],
    liked: [],
    searches: [],
    hours: new Array<number>(24).fill(0),
    hourEnergy: 0,
    ...overrides,
  };
}

function inputOf(overrides: Partial<FeedInput> = {}): FeedInput {
  return {
    profile: profileOf(),
    bundles: new Map(),
    shelves: [],
    hidden: new Set(),
    taps: {},
    dontRepeat: false,
    now: NOW,
    ...overrides,
  };
}


const kinds = (sections: FeedSection[]) => sections.map((section) => section.kind);
const find = (sections: FeedSection[], kind: FeedSection["kind"]) => sections.find((section) => section.kind === kind);

describe("cold start", () => {
  it("shows the first market shelves when there is no history", () => {
    const shelves: HomeShelf[] = [
      { title: "Quick picks", items: [{ kind: "track", track: track("q1") }] },
      { title: "Trending", items: [{ kind: "track", track: track("q2") }] },
      { title: "Chill", items: [{ kind: "track", track: track("q3") }] },
      { title: "Extra", items: [{ kind: "track", track: track("q4") }] },
    ];

    const sections = buildHomeSections(inputOf({ shelves }));

    expect(kinds(sections)).toEqual(["market", "market", "market"]);
    expect(sections.filter((section) => section.kind === "market").map((section) => section.priority)).toEqual([60, 59, 58]);
    expect(sections.map((section) => section.title)).toEqual(["Quick picks", "Trending", "Chill"]);
  });

  it("is empty when there is nothing to show", () => {
    expect(buildHomeSections(inputOf())).toEqual([]);
  });
});

describe("pinned and learned rows", () => {
  it("puts recent plays first, drops hidden songs, and ignores learned taps for pinned rows", () => {
    const recent = ["r1", "r2", "r3", "r4", "r5"].map((id) => track(id));
    const profile = profileOf({
      maturity: "light",
      recentlyPlayed: recent,
      artists: [artistScore("UC-a", "Alpha", 50, NOW - 2 * HOUR)],
    });

    const sections = buildHomeSections(inputOf({ profile, hidden: new Set(["r2"]), taps: { "jump-back-in": 10 } }));

    expect(sections[0].kind).toBe("jump-back-in");
    expect(sections[0].priority).toBe(100);
    expect(sections[0].layout).toBe("tiles");
    expect(sections[0].items.map((item) => (item.kind === "track" ? item.track.id : ""))).toEqual(["r1", "r3", "r4", "r5"]);
  });

  it("raises an unpinned row by its learned taps", () => {
    const profile = profileOf({
      maturity: "warmed",
      artists: [artistScore("UC-a", "Alpha", 90), artistScore("UC-b", "Beta", 80), artistScore("UC-c", "Gamma", 70)],
    });

    const plain = find(buildHomeSections(inputOf({ profile })), "favorite-artists");
    const tapped = find(buildHomeSections(inputOf({ profile, taps: { "favorite-artists": 10 } })), "favorite-artists");

    expect(plain?.priority).toBe(64);
    expect(tapped?.priority).toBeCloseTo(64 + 10 * (1 - Math.exp(-5)), 6);
  });
});

describe("playlists for you", () => {
  it("builds the crate from six playlists, puts YouTube's own first, and drops playlist-only shelves", () => {
    const playlist = (id: string) => ({ kind: "playlist" as const, id, title: `Playlist ${id}`, subtitle: "", thumb: null });
    const shelves: HomeShelf[] = [
      { title: "Made for you", items: ["RDCLAK5uy_mine", "PL1", "PL2", "PL3", "PL4", "PL5"].map(playlist) },
      { title: "New songs", items: [{ kind: "track", track: track("n1") }] },
      { title: "Charts", items: ["PL9", "PL10"].map(playlist) },
    ];

    const sections = buildHomeSections(inputOf({ shelves }));

    const crate = find(sections, "playlists-for-you");
    expect(crate?.priority).toBe(94);
    expect(crate?.playlists?.[0].id).toBe("RDCLAK5uy_mine");
    expect(kinds(sections)).toEqual(["playlists-for-you", "market"]);
    expect(find(sections, "market")?.title).toBe("New songs");
  });

  it("keeps each playlist once and ranks by taste affinity", () => {
    const shelves: HomeShelf[] = [
      { title: "A", items: [{ kind: "playlist", id: "PLx", title: "One", subtitle: "", thumb: null }] },
      { title: "B", items: [{ kind: "playlist", id: "PLx", title: "Again", subtitle: "", thumb: null }] },
    ];
    expect(cratePlaylists(shelves).map((playlist) => playlist.title)).toEqual(["One"]);

    const affinity = tasteAffinity([artistScore("UC-a", "Alpha", 90), artistScore("UC-b", "Beta", 45)]);
    expect(affinity.get("alpha")).toBe(1);
    expect(affinity.get("beta")).toBe(0.5);
  });
});

describe("heavy rotation", () => {
  it("notes listens with a singular or plural word", () => {
    const row = (id: string, listens: number) => ({ track: track(id), listens, score: 2 });
    const profile = profileOf({
      maturity: "warmed",
      heavyRotation: [row("h1", 1), row("h2", 2), row("h3", 3), row("h4", 4)],
    });

    const section = find(buildHomeSections(inputOf({ profile })), "heavy-rotation");

    expect(section?.items.map((item) => (item.kind === "track" ? item.note : ""))).toEqual([
      "1 play lately",
      "2 plays lately",
      "3 plays lately",
      "4 plays lately",
    ]);
  });
});

describe("new releases", () => {
  it("keeps releases from this year and last year, newest first", () => {
    const profile = profileOf({
      maturity: "warmed",
      artists: [artistScore("UC-a", "Alpha", 90)],
    });
    const bundles = new Map([
      [
        "UC-a",
        bundle("UC-a", "Alpha", [], [], [
          album("old", "Old", "2019"),
          album("a1", "Newest A", "2026"),
          album("a2", "Newest B", "2026"),
          album("last", "Last year", "2025"),
        ]),
      ],
    ]);

    const section = find(buildHomeSections(inputOf({ profile, bundles })), "new-from-your-artists");

    expect(section?.items.map((item) => (item.kind === "album" ? item.album.title : ""))).toEqual([
      "Newest A",
      "Newest B",
      "Last year",
    ]);
  });
});

describe("recommendations do not repeat a song", () => {
  const profile = profileOf({
    maturity: "warmed",
    artists: [artistScore("UC-a", "Alpha", 90), artistScore("UC-b", "Beta", 80), artistScore("UC-c", "Gamma", 70)],
  });
  const bundles = new Map([
    ["UC-a", bundle("UC-a", "Alpha", [track("a1", "Alpha"), track("a2", "Alpha")], ["UC-b"])],
    [
      "UC-b",
      bundle("UC-b", "Beta", [track("b1", "Beta"), track("b2", "Beta"), track("b3", "Beta"), track("b4", "Beta")], ["UC-a", "UC-c"]),
    ],
    [
      "UC-c",
      bundle("UC-c", "Gamma", [track("c1", "Gamma"), track("c2", "Gamma")], ["UC-a", "UC-d", "UC-e"]),
    ],
    [
      "UC-d",
      bundle("UC-d", "Delta", [track("d1", "Delta"), track("d2", "Delta"), track("d3", "Delta"), track("d4", "Delta")]),
    ],
    [
      "UC-e",
      bundle("UC-e", "Epsilon", [track("e1", "Epsilon"), track("e2", "Epsilon"), track("e3", "Epsilon"), track("e4", "Epsilon")]),
    ],
  ]);

  it("never lists one song in two rows", () => {
    const sections = buildHomeSections(inputOf({ profile, bundles }));
    const songIds = sections
      .filter((section) => section.kind === "recommended-today" || section.kind === "because")
      .flatMap((section) => section.items.flatMap((item) => (item.kind === "track" ? [item.track.id] : [])));

    expect(songIds.length).toBeGreaterThan(0);
    expect(new Set(songIds).size).toBe(songIds.length);
    expect(find(sections, "because")).toBeDefined();
  });

  it("keeps songs the user already played out of the suggestions", () => {
    const sections = buildHomeSections(inputOf({ profile: { ...profile, playedTrackIds: new Set(["b1", "b2"]) }, bundles }));
    const songIds = sections.flatMap((section) =>
      section.kind === "recommended-today" || section.kind === "because"
        ? section.items.flatMap((item) => (item.kind === "track" ? [item.track.id] : []))
        : [],
    );

    expect(songIds).not.toContain("b1");
    expect(songIds).not.toContain("b2");
  });

  it("drops played songs from side mixes when don't-repeat is on", () => {
    const sideProfile = profileOf({
      maturity: "warmed",
      artists: [
        artistScore("UC-a", "Alpha", 90),
        artistScore("UC-b", "Beta", 80),
        artistScore("UC-c", "Gamma", 70),
        artistScore("UC-d", "Delta", 60),
      ],
      playedTrackIds: new Set(["al1"]),
    });
    const sideBundles = new Map([
      ["UC-a", bundle("UC-a", "Alpha", [track("al1", "Alpha"), track("al2", "Alpha"), track("al3", "Alpha"), track("al4", "Alpha")], ["UC-b", "UC-c"])],
      ["UC-b", bundle("UC-b", "Beta", [track("be1", "Beta"), track("be2", "Beta"), track("be3", "Beta"), track("be4", "Beta")], ["UC-a"])],
      ["UC-c", bundle("UC-c", "Gamma", [track("ga1", "Gamma"), track("ga2", "Gamma"), track("ga3", "Gamma"), track("ga4", "Gamma")], ["UC-a"])],
    ]);
    const sideIds = (dontRepeat: boolean) => {
      const section = find(buildHomeSections(inputOf({ profile: sideProfile, bundles: sideBundles, dontRepeat })), "your-mixes");
      const side = section?.items.find((item) => item.kind === "side");
      return side?.kind === "side" && side.side.source.type === "tracks" ? side.side.source.tracks.map((song) => song.id) : [];
    };

    expect(sideIds(false)).toContain("al1");
    expect(sideIds(true)).not.toContain("al1");
    expect(sideIds(true)).toContain("al2");
  });
});

describe("diversity and clock", () => {
  const section = (id: string, anchorKey?: string): FeedSection => ({
    id,
    kind: "because",
    title: id,
    layout: "row",
    priority: 1,
    items: [],
    anchorKey,
  });

  it("moves the second of two neighbours with the same anchor past the next different one", () => {
    const result = diversify([section("A", "k1"), section("B", "k1"), section("C", "k2")]);

    expect(result.map((item) => item.id)).toEqual(["A", "C", "B"]);
  });

  it("leaves sections without an anchor alone", () => {
    expect(diversify([section("A"), section("B")]).map((item) => item.id)).toEqual(["A", "B"]);
  });

  it("picks the greeting by local hour", () => {
    const at = (hour: number) => hourAwareTodayTitle(new Date(2026, 10, 9, hour).getTime());

    expect([at(9), at(13), at(20), at(23), at(3)]).toEqual([
      "Picks for your morning",
      "Recommended for today",
      "Recommended for tonight",
      "Late night picks",
      "Late night picks",
    ]);
  });

  it("gives the same feed for the same inputs", () => {
    const profileWithArtists = profileOf({
      maturity: "warmed",
      artists: [artistScore("UC-a", "Alpha", 90), artistScore("UC-b", "Beta", 80), artistScore("UC-c", "Gamma", 70)],
    });
    const input = inputOf({ profile: profileWithArtists });

    expect(buildHomeSections(input)).toEqual(buildHomeSections(input));
  });
});

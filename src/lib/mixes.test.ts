import { describe, expect, it } from "vitest";
import type { ArtistBundle } from "./artistBundle";
import { artistMixCard, captionWith, namesLine, radioCard, sideMix } from "./mixes";
import type { Track } from "../types";

const track = (id: string, artist: string, thumb: string | null = null): Track => ({ id, title: `Song ${id}`, artist, thumb });

const members = [
  { key: "alpha", name: "Alpha", artistId: "UC-alpha" },
  { key: "beta", name: "Beta", artistId: "UC-beta" },
];

const bundleOf = (related: string[], thumb: string | null = null): ArtistBundle => ({
  artistId: "UC-x",
  name: "X",
  thumb,
  topSongs: [],
  albums: [],
  related: related.map((name) => ({ id: `UC-${name}`, name, thumb: null })),
  fetchedAt: 0,
});

describe("captionWith and namesLine", () => {
  it("reads names as a caption and as a list", () => {
    expect(captionWith([])).toBe("");
    expect(captionWith(["A"])).toBe("With A");
    expect(captionWith(["A", "B"])).toBe("With A and B");
    expect(captionWith(["A", "B", "C", "D"])).toBe("With A, B and C");
    expect(namesLine([])).toBe("");
    expect(namesLine(["A"])).toBe("A");
    expect(namesLine(["A", "B"])).toBe("A & B");
    expect(namesLine(["A", "B", "C"])).toBe("A, B & C");
  });
});

describe("sideMix", () => {
  const theirs = Array.from({ length: 40 }, (_, index) => track(`t${index}`, `Artist ${index % 10}`));
  const neighbours = Array.from({ length: 20 }, (_, index) => track(`n${index}`, `Neighbour ${index % 5}`));

  it("builds a 30-song side with a familiar song in three of every four slots", () => {
    const mix = sideMix({
      members,
      letter: "A",
      own: [],
      theirs,
      neighbours,
      hidden: new Set(),
      daySeed: 7,
    });

    expect(mix).not.toBeNull();
    expect(mix?.id).toBe("side-alpha+beta-A");
    expect(mix?.caption).toBe("Alpha & Beta");
    expect(mix?.count).toBe(30);
    expect(mix?.fresh).toBe(7);
    expect(mix?.source).toMatchObject({ type: "tracks", label: "Side A" });
  });

  it("is the same on the same day and changes with the day", () => {
    const build = (daySeed: number) =>
      sideMix({ members, letter: "A", own: [], theirs, neighbours, hidden: new Set(), daySeed })?.source;

    expect(build(7)).toEqual(build(7));
    expect(build(8)).not.toEqual(build(7));
  });

  it("leaves out hidden songs and gives up below ten songs", () => {
    const hidden = new Set(theirs.map((song) => song.id));
    const mix = sideMix({ members, letter: "A", own: [], theirs, neighbours, hidden, daySeed: 7 });

    expect(mix?.source.type === "tracks" && mix.source.tracks.some((song) => hidden.has(song.id))).toBe(false);
    expect(
      sideMix({ members, letter: "A", own: [], theirs: theirs.slice(0, 3), neighbours: [], hidden: new Set(), daySeed: 7 }),
    ).toBeNull();
  });

  it("caps songs from one artist at four", () => {
    const sameArtist = Array.from({ length: 12 }, (_, index) => track(`s${index}`, "Solo"));
    const mix = sideMix({ members, letter: "B", own: [], theirs: sameArtist, neighbours: [], hidden: new Set(), daySeed: 1 });

    expect(mix).toBeNull();
  });

  it("only takes yours-songs by a member artist", () => {
    const own = [track("y1", "Alpha"), track("y2", "Stranger"), track("y3", "Beta & Friend")];
    const mix = sideMix({
      members,
      letter: "A",
      own,
      theirs: [],
      neighbours: Array.from({ length: 12 }, (_, index) => track(`f${index}`, `Other ${index}`)),
      hidden: new Set(),
      daySeed: 3,
    });
    const ids = mix?.source.type === "tracks" ? mix.source.tracks.map((song) => song.id) : [];

    expect(ids).toContain("y1");
    expect(ids).toContain("y3");
    expect(ids).not.toContain("y2");
  });
});

describe("artist cards", () => {
  it("names an artist mix after the artist and falls back to the artist name for its caption", () => {
    const card = artistMixCard({ artistId: "UC-a", name: "Alpha", thumb: "a.jpg" }, null);

    expect(card).toEqual({
      style: "mix",
      id: "UC-a-mix",
      name: "Alpha Mix",
      thumb: "a.jpg",
      caption: "Alpha",
      source: { type: "artist-mix", artistId: "UC-a", name: "Alpha Mix" },
    });
  });

  it("captions a radio from the first related artists, or with Radio when none are known", () => {
    const withRelated = radioCard("UC-a-radio", { artistId: "UC-a", name: "Alpha", thumb: null }, bundleOf(["R1", "R2", "R3", "R4"], "b.jpg"));
    const without = radioCard("UC-a-station", { artistId: "UC-a", name: "Alpha", thumb: null }, null);

    expect(withRelated.caption).toBe("With R1, R2 and R3");
    expect(withRelated.thumb).toBe("b.jpg");
    expect(without.caption).toBe("Radio");
    expect(without.source).toEqual({ type: "artist-radio", artistId: "UC-a", name: "Alpha Radio" });
  });
});

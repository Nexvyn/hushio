import { describe, expect, it, vi } from "vitest";
import type { ArtistBundle } from "./artistBundle";
import {
  ARTIST_MIX_SIZE,
  artistMixQueue,
  artistRadioQueue,
  dedupeTracks,
  type PlayDeps,
  RADIO_SIZE,
  resolvePlaySource,
  sourceLabel,
} from "./playQueue";
import type { Track } from "../types";

const track = (id: string, artist = "Artist"): Track => ({ id, title: `Song ${id}`, artist, thumb: null });
const ids = (tracks: readonly Track[]) => tracks.map((item) => item.id);

const bundleOf = (artistId: string, topSongs: Track[], related: string[] = []): ArtistBundle => ({
  artistId,
  name: artistId,
  thumb: null,
  topSongs,
  albums: [],
  related: related.map((id) => ({ id, name: id, thumb: null })),
  fetchedAt: 0,
});

const NOW = 1_700_000_000_000;

function depsOf(bundles: ArtistBundle[], overrides: Partial<PlayDeps> = {}): PlayDeps {
  const byId = new Map(bundles.map((bundle) => [bundle.artistId, bundle]));
  return {
    bundle: vi.fn(async (artistId: string) => byId.get(artistId) ?? null),
    albumTracks: vi.fn(async () => []),
    playlistTracks: vi.fn(async () => []),
    now: NOW,
    ...overrides,
  };
}

describe("dedupeTracks", () => {
  it("keeps the first copy of each id", () => {
    const tracks = [track("a", "First"), track("b"), track("a", "Second")];

    expect(dedupeTracks(tracks).map((item) => [item.id, item.artist])).toEqual([
      ["a", "First"],
      ["b", "Artist"],
    ]);
  });
});

describe("artistMixQueue", () => {
  const top = Array.from({ length: 40 }, (_, index) => track(`s${index}`));

  it("is seeded by the artist and the time, caps at thirty and has no repeats", () => {
    const first = artistMixQueue(top, "UC-a", NOW);

    expect(first).toHaveLength(ARTIST_MIX_SIZE);
    expect(new Set(ids(first)).size).toBe(ARTIST_MIX_SIZE);
    expect(artistMixQueue(top, "UC-a", NOW)).toEqual(first);
    expect(ids(artistMixQueue(top, "UC-a", NOW + 1))).not.toEqual(ids(first));
    expect(ids(artistMixQueue(top, "UC-b", NOW))).not.toEqual(ids(first));
  });
});

describe("artistRadioQueue", () => {
  it("plays two seed songs, then one related song, in turn", () => {
    const seeds = ["s1", "s2", "s3", "s4"].map((id) => track(id, "Seed"));
    const extras = [track("x1", "One"), track("x2", "Two")];

    const queue = ids(artistRadioQueue(seeds, [extras], "UC-a", NOW));

    expect(queue.slice(0, 2)).toEqual(["s1", "s2"]);
    expect(queue.slice(3, 5)).toEqual(["s3", "s4"]);
    expect([queue[2], queue[5]].sort()).toEqual(["x1", "x2"]);
    expect(queue).toHaveLength(6);
  });

  it("takes at most four songs from one artist name and returns at most forty songs", () => {
    const sameArtist = Array.from({ length: 6 }, (_, index) => track(`same${index}`, "Same"));
    const other = [track("other", "Other")];

    const capped = artistRadioQueue([], [sameArtist, other], "UC-a", NOW);
    expect(capped.filter((item) => item.artist === "Same")).toHaveLength(4);
    expect(capped.map((item) => item.id)).toContain("other");

    const long = Array.from({ length: 60 }, (_, index) => track(`l${index}`, `Artist ${index}`));
    expect(artistRadioQueue(long, [], "UC-a", NOW)).toHaveLength(RADIO_SIZE);
  });
});

describe("resolvePlaySource", () => {
  it("plays a set of tracks from its label, or gives nothing when it is empty", async () => {
    const deps = depsOf([]);

    await expect(resolvePlaySource({ type: "tracks", tracks: [track("a"), track("a")], label: "Side A" }, deps)).resolves.toEqual({
      tracks: [track("a")],
      from: "Side A",
    });
    await expect(resolvePlaySource({ type: "tracks", tracks: [], label: "Side A" }, deps)).resolves.toBeNull();
  });

  it("builds an artist mix from the artist's songs", async () => {
    const top = [track("s1"), track("s2"), track("s3")];
    const deps = depsOf([bundleOf("UC-a", top)]);

    const result = await resolvePlaySource({ type: "artist-mix", artistId: "UC-a", name: "Alpha Mix" }, deps);

    expect(result?.from).toBe("Alpha Mix");
    expect(ids(result?.tracks ?? [])).toEqual(ids(artistMixQueue(top, "UC-a", NOW)));
  });

  it("returns nothing for an artist with no bundle or no songs", async () => {
    const deps = depsOf([bundleOf("UC-empty", [])]);

    await expect(resolvePlaySource({ type: "artist-mix", artistId: "UC-missing", name: "X" }, deps)).resolves.toBeNull();
    await expect(resolvePlaySource({ type: "artist-mix", artistId: "UC-empty", name: "X" }, deps)).resolves.toBeNull();
    await expect(resolvePlaySource({ type: "artist-radio", artistId: "UC-empty", name: "X" }, deps)).resolves.toBeNull();
  });

  it("builds a radio from the artist and the first four related artists", async () => {
    const related = ["r1", "r2", "r3", "r4", "r5"];
    const deps = depsOf([
      bundleOf("UC-a", [track("s1"), track("s2")], related),
      ...related.map((id) => bundleOf(id, [track(`${id}-song`, id)])),
    ]);

    const result = await resolvePlaySource({ type: "artist-radio", artistId: "UC-a", name: "Alpha Radio" }, deps);

    expect(result?.from).toBe("Alpha Radio");
    expect(ids(result?.tracks ?? [])).toEqual(expect.arrayContaining(["s1", "s2", "r1-song", "r4-song"]));
    expect(ids(result?.tracks ?? [])).not.toContain("r5-song");
  });

  it("loads albums and playlists through their own loaders", async () => {
    const deps = depsOf([], {
      albumTracks: vi.fn(async () => [track("al1"), track("al1")]),
      playlistTracks: vi.fn(async () => []),
    });

    await expect(resolvePlaySource({ type: "album", albumId: "MPRE1", name: "Album" }, deps)).resolves.toEqual({
      tracks: [track("al1")],
      from: "Album",
    });
    await expect(resolvePlaySource({ type: "yt-playlist", playlistId: "PL1", name: "List" }, deps)).resolves.toBeNull();
  });
});

describe("sourceLabel", () => {
  it("uses the label of a track set and the name of a card", () => {
    expect(sourceLabel({ type: "tracks", tracks: [], label: "Side B" })).toBe("Side B");
    expect(sourceLabel({ type: "artist-mix", artistId: "UC-a", name: "Alpha Mix" })).toBe("Alpha Mix");
  });
});

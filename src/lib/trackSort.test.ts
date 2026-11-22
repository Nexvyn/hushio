import { describe, expect, it } from "vitest";
import {
  CUSTOM_SORT,
  defaultDirection,
  directionLabel,
  sortSummary,
  sortTracksBy,
  trackComparator,
  type SortableTrack,
  type TrackSort,
} from "./trackSort";

type Row = SortableTrack & { id: string };

const row = (id: string, title: string, artist: string, extra: Partial<Row> = {}): Row => ({
  id,
  title,
  artist,
  album: null,
  duration: 200,
  ...extra,
});

const sortBy = (tracks: Row[], sort: Partial<TrackSort> & Pick<TrackSort, "field">) =>
  sortTracksBy(tracks, { direction: "asc", then: null, ...sort }).map((track) => track.id);

const songs: Row[] = [
  row("a", "Bravo", "Zed", { album: "Mango", duration: 240, addedAt: 2_000 }),
  row("b", "Alpha", "Amy", { album: "Kiwi", duration: 180, addedAt: 3_000 }),
  row("c", "Charlie", "Amy", { album: "Apple", duration: 300, addedAt: 1_000 }),
];

describe("sortTracksBy keys", () => {
  it("returns the list order for custom", () => {
    expect(sortBy(songs, { field: "custom" })).toEqual(["a", "b", "c"]);
  });

  it("sorts by title, both directions", () => {
    expect(sortBy(songs, { field: "title" })).toEqual(["b", "a", "c"]);
    expect(sortBy(songs, { field: "title", direction: "desc" })).toEqual(["c", "a", "b"]);
  });

  it("sorts by artist, both directions", () => {
    expect(sortBy(songs, { field: "artist" })).toEqual(["b", "c", "a"]);
    expect(sortBy(songs, { field: "artist", direction: "desc" })).toEqual(["a", "b", "c"]);
  });

  it("sorts by album, both directions", () => {
    expect(sortBy(songs, { field: "album" })).toEqual(["c", "b", "a"]);
    expect(sortBy(songs, { field: "album", direction: "desc" })).toEqual(["a", "b", "c"]);
  });

  it("sorts by duration, shortest first and longest first", () => {
    expect(sortBy(songs, { field: "duration" })).toEqual(["b", "a", "c"]);
    expect(sortBy(songs, { field: "duration", direction: "desc" })).toEqual(["c", "a", "b"]);
  });

  it("sorts by date added, oldest first and newest first", () => {
    expect(sortBy(songs, { field: "added" })).toEqual(["c", "a", "b"]);
    expect(sortBy(songs, { field: "added", direction: "desc" })).toEqual(["b", "a", "c"]);
  });
});

describe("second key", () => {
  it("breaks ties with the second key", () => {
    expect(sortBy(songs, { field: "artist", then: "album" })).toEqual(["c", "b", "a"]);
  });

  it("uses the same direction for the second key", () => {
    expect(sortBy(songs, { field: "artist", direction: "desc", then: "album" })).toEqual(["a", "b", "c"]);
  });

  it("does not change the order when the first key differs", () => {
    expect(sortBy(songs, { field: "duration", then: "artist" })).toEqual(["b", "a", "c"]);
  });
});

describe("text comparison", () => {
  it("compares numbers in titles as numbers", () => {
    const tracks = [row("10", "Track 10", "A"), row("2", "Track 2", "A"), row("1", "track 1", "A")];
    expect(sortBy(tracks, { field: "title" })).toEqual(["1", "2", "10"]);
  });

  it("treats accented letters as their base letter", () => {
    const tracks = [row("z", "Zebra", "A"), row("e", "Éclair", "A"), row("f", "Fado", "A"), row("ea", "Eagle", "A")];
    expect(sortBy(tracks, { field: "title" })).toEqual(["ea", "e", "f", "z"]);
  });

  it("ignores case", () => {
    const tracks = [row("b", "banana", "A"), row("a", "Apple", "A")];
    expect(sortBy(tracks, { field: "title" })).toEqual(["a", "b"]);
  });
});

describe("missing values", () => {
  const gaps: Row[] = [
    row("none", "No album", "A", { album: null, addedAt: undefined, duration: undefined }),
    row("blank", "Blank album", "A", { album: "   ", duration: 0 }),
    row("set", "Set", "A", { album: "Lake", duration: 90, addedAt: 5 }),
    row("late", "Late", "A", { album: "Hill", duration: 500, addedAt: 9 }),
  ];

  it("puts missing album last in both directions", () => {
    expect(sortBy(gaps, { field: "album" })).toEqual(["late", "set", "none", "blank"]);
    expect(sortBy(gaps, { field: "album", direction: "desc" })).toEqual(["set", "late", "none", "blank"]);
  });

  it("puts missing duration and date last in both directions", () => {
    expect(sortBy(gaps, { field: "duration" })).toEqual(["set", "late", "none", "blank"]);
    expect(sortBy(gaps, { field: "duration", direction: "desc" })).toEqual(["late", "set", "none", "blank"]);
    expect(sortBy(gaps, { field: "added" })).toEqual(["set", "late", "none", "blank"]);
    expect(sortBy(gaps, { field: "added", direction: "desc" })).toEqual(["late", "set", "none", "blank"]);
  });

  it("uses the second key when the first key ties", () => {
    const tied = [
      row("long", "T", "A", { album: "Same", duration: 300 }),
      row("short", "T", "A", { album: "Same", duration: 100 }),
    ];
    expect(sortBy(tied, { field: "album", then: "duration" })).toEqual(["short", "long"]);
  });

  it("keeps the original order when both keys are missing", () => {
    expect(sortBy(gaps, { field: "album", then: "duration" })).toEqual(["late", "set", "none", "blank"]);
  });
});

describe("stability and input", () => {
  it("keeps the original order for equal keys", () => {
    const tracks = [row("1", "Same", "A"), row("2", "Same", "A"), row("3", "Same", "A")];
    expect(sortBy(tracks, { field: "title" })).toEqual(["1", "2", "3"]);
    expect(sortBy(tracks, { field: "title", direction: "desc" })).toEqual(["1", "2", "3"]);
  });

  it("does not mutate the input array or its items", () => {
    const input = [...songs];
    const before = input.map((track) => ({ ...track }));
    const sorted = sortTracksBy(input, { field: "title", direction: "desc", then: "artist" });
    expect(sorted).not.toBe(input);
    expect(input).toEqual(before);
    expect(input.map((track) => track.id)).toEqual(["a", "b", "c"]);
  });

  it("returns a copy for custom order", () => {
    const sorted = sortTracksBy(songs, CUSTOM_SORT);
    expect(sorted).not.toBe(songs);
    expect(sorted).toEqual(songs);
  });

  it("compares two tracks with the comparator", () => {
    const compare = trackComparator({ field: "title", direction: "desc", then: null });
    expect(compare(songs[0], songs[1])).toBeLessThan(0);
    expect(trackComparator(CUSTOM_SORT)(songs[0], songs[1])).toBe(0);
  });
});

describe("labels", () => {
  it("uses the default direction per field", () => {
    expect(defaultDirection("title")).toBe("asc");
    expect(defaultDirection("duration")).toBe("asc");
    expect(defaultDirection("added")).toBe("desc");
  });

  it("names each direction in plain words", () => {
    expect(directionLabel("title", "asc")).toBe("A to Z");
    expect(directionLabel("title", "desc")).toBe("Z to A");
    expect(directionLabel("duration", "asc")).toBe("Shortest first");
    expect(directionLabel("added", "desc")).toBe("Newest first");
  });

  it("summarises the active sort", () => {
    expect(sortSummary(CUSTOM_SORT)).toBe("Custom order");
    expect(sortSummary(CUSTOM_SORT, "Album order")).toBe("Album order");
    expect(sortSummary({ field: "artist", direction: "asc", then: "album" })).toBe("Artist, then Album");
    expect(sortSummary({ field: "duration", direction: "asc", then: null })).toBe("Duration");
  });
});

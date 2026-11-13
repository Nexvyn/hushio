import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import type { JournalEntry } from "./replay";
import { buildSmartLists, NOT_PLAYED_WINDOW_MS, saveAsPlaylist, SMART_LIMIT, smartTracks } from "./smartLists";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 13, 12);
const initialLibrary = useLibrary.getState();

const song = (id: string, artist = "Artist"): LibraryTrack => ({
  id,
  title: `Title ${id}`,
  artist,
  thumb: null,
  album: null,
  duration: 200,
  explicit: false,
});

const play = (id: string, daysAgo: number, heard = 120): JournalEntry => ({
  track: { id, title: `Title ${id}`, artist: "Artist", thumb: null },
  at: NOW - daysAgo * DAY,
  heard,
});

const ids = (tracks: readonly LibraryTrack[]) => tracks.map((track) => track.id);

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
});

describe("Most played", () => {
  it("orders by play count, then by the most recent play", () => {
    const journal = [
      play("a", 2),
      play("a", 5),
      play("b", 1),
      play("b", 3),
      play("c", 3),
      play("c", 4),
      play("d", 10),
      play("d", 11),
      play("d", 12),
    ];
    const tracks = smartTracks("most-played", { liked: [], playlists: [], journal, now: NOW });
    expect(ids(tracks)).toEqual(["d", "b", "a", "c"]);
  });

  it("does not count skips shorter than 30 seconds", () => {
    const journal = [play("a", 1, 5), play("a", 2, 5), play("b", 1, 90)];
    const tracks = smartTracks("most-played", { liked: [], playlists: [], journal, now: NOW });
    expect(ids(tracks)).toEqual(["b"]);
  });

  it("keeps at most 50 songs", () => {
    const journal = Array.from({ length: 60 }, (_, index) => play(`s${index}`, 1)).flatMap((entry, index) =>
      Array.from({ length: index + 1 }, () => entry),
    );
    const tracks = smartTracks("most-played", { liked: [], playlists: [], journal, now: NOW });
    expect(tracks).toHaveLength(SMART_LIMIT);
    expect(tracks[0].id).toBe("s59");
  });

  it("uses the library copy when the song is saved, and the journal title otherwise", () => {
    const saved = song("a", "Saved artist");
    const tracks = smartTracks("most-played", {
      liked: [saved],
      playlists: [],
      journal: [play("a", 1), play("z", 1)],
      now: NOW,
    });
    expect(tracks.find((track) => track.id === "a")).toBe(saved);
    expect(tracks.find((track) => track.id === "z")).toMatchObject({ title: "Title z", duration: 0 });
  });
});

describe("Recently added", () => {
  it("returns the newest liked songs first, capped at 50", () => {
    const liked = Array.from({ length: 70 }, (_, index) => song(`l${index}`));
    const tracks = smartTracks("recently-added", { liked, playlists: [], journal: [], now: NOW });
    expect(tracks).toHaveLength(SMART_LIMIT);
    expect(ids(tracks).slice(0, 3)).toEqual(["l0", "l1", "l2"]);
  });
});

describe("Not played in a while", () => {
  it("lists liked songs with no counted play in the last 30 days, least recent first", () => {
    const liked = [song("recent"), song("old"), song("never")];
    const journal = [play("recent", 29), play("old", 31)];
    const tracks = smartTracks("not-played", { liked, playlists: [], journal, now: NOW });
    expect(ids(tracks)).toEqual(["never", "old"]);
  });

  it("counts a play exactly 30 days ago as inside the window", () => {
    const liked = [song("edge")];
    expect(smartTracks("not-played", { liked, playlists: [], journal: [play("edge", 30)], now: NOW })).toEqual([]);
    const justPast = [{ ...play("edge", 0), at: NOW - NOT_PLAYED_WINDOW_MS - 1 }];
    expect(ids(smartTracks("not-played", { liked, playlists: [], journal: justPast, now: NOW }))).toEqual(["edge"]);
  });

  it("follows the clock: the same journal drops a song once 30 days pass", () => {
    const liked = [song("a")];
    const journal = [play("a", 10)];
    expect(smartTracks("not-played", { liked, playlists: [], journal, now: NOW })).toEqual([]);
    expect(ids(smartTracks("not-played", { liked, playlists: [], journal, now: NOW + 21 * DAY }))).toEqual(["a"]);
  });
});

describe("Empty states", () => {
  it("returns no songs for every list when nothing is saved or played", () => {
    const lists = buildSmartLists({ liked: [], playlists: [], journal: [], now: NOW });
    expect(lists.map((list) => list.id)).toEqual(["most-played", "recently-added", "not-played"]);
    expect(lists.every((list) => list.tracks.length === 0)).toBe(true);
  });
});

describe("Save as playlist", () => {
  it("creates a real playlist with the songs in order", () => {
    const id = saveAsPlaylist("Most played", [song("x"), song("y")]);

    const saved = useLibrary.getState().playlists.find((playlist: Playlist) => playlist.id === id);
    expect(saved?.name).toBe("Most played");
    expect(ids(saved?.tracks ?? [])).toEqual(["x", "y"]);
  });
});

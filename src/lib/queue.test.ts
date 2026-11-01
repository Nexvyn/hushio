import { describe, expect, it } from "vitest";
import {
  advance,
  hash32,
  inYourOrder,
  insertIds,
  mulberry32,
  nextPass,
  orderFrom,
  seededShuffle,
  shuffleUpcoming,
} from "./queue";
import type { Track } from "../types";

const track = (id: string): Track => ({ id, title: id, artist: "Artist", thumb: null });
const ids = (tracks: Track[]) => tracks.map((item) => item.id);
const letters = ["a", "b", "c", "d", "e"];
const row = () => letters.map(track);

describe("seededShuffle", () => {
  it("returns the same order for the same seed and keeps every item", () => {
    const first = seededShuffle(row(), 42);
    expect(ids(seededShuffle(row(), 42))).toEqual(ids(first));
    expect(ids(first).sort()).toEqual(letters);
  });

  it("does not change its input", () => {
    const input = row();
    seededShuffle(input, 7);
    expect(ids(input)).toEqual(letters);
  });
});

describe("nextPass", () => {
  it("never starts with the song that just ended", () => {
    for (let round = 0; round < 20; round++) {
      const queue = letters.map((id) => track(`${id}${round}`));
      const last = queue.at(-1)?.id;
      expect(nextPass(queue)[0].id).not.toBe(last);
    }
  });
});

describe("advance", () => {
  it("moves to the next index inside the queue", () => {
    expect(advance(row(), 1, false).index).toBe(2);
  });

  it("wraps to the start at the end without shuffle", () => {
    const result = advance(row(), 4, false);
    expect(result.index).toBe(0);
    expect(ids(result.queue)).toEqual(letters);
  });

  it("reshuffles the whole queue at the end with shuffle", () => {
    const result = advance(row(), 4, true);
    expect(result.index).toBe(0);
    expect(ids(result.queue).sort()).toEqual(letters);
  });
});

describe("shuffle round trip", () => {
  it("restores the user's order after shuffle is turned off", () => {
    const queue = row();
    const order = orderFrom(queue, 0);
    const shuffled = shuffleUpcoming(queue, 0);
    expect(shuffled[0].id).toBe("a");
    expect(ids(inYourOrder(shuffled, 0, order))).toEqual(letters);
  });

  it("keeps the playing song first and orders the rest from it in a cycle", () => {
    const queue = [track("c"), track("e"), track("a"), track("d"), track("b")];
    const order = ["a", "b", "c", "d", "e"];
    expect(ids(inYourOrder(queue, 0, order))).toEqual(["c", "d", "e", "a", "b"]);
  });

  it("puts songs that are not in the saved order last", () => {
    const queue = [track("a"), track("x"), track("b")];
    expect(ids(inYourOrder(queue, 0, ["a", "b"]))).toEqual(["a", "b", "x"]);
  });
});

describe("insertIds", () => {
  it("inserts after a song when it is given", () => {
    expect(insertIds(["a", "b", "c"], ["x"], "a")).toEqual(["a", "x", "b", "c"]);
  });

  it("appends when the song is missing", () => {
    expect(insertIds(["a", "b"], ["x"], undefined)).toEqual(["a", "b", "x"]);
    expect(insertIds(["a", "b"], ["x"], "z")).toEqual(["a", "b", "x"]);
  });
});

describe("hash32 and mulberry32", () => {
  it("gives the same value for the same text and different values for different text", () => {
    expect(hash32("artist-1")).toBe(hash32("artist-1"));
    expect(hash32("artist-1")).not.toBe(hash32("artist-2"));
    expect(hash32("")).toBe(0x811c9dc5);
  });

  it("repeats the same sequence for one seed and stays in [0, 1)", () => {
    const draws = (seed: number) => {
      const next = mulberry32(seed);
      return [next(), next(), next()];
    };
    expect(draws(42)).toEqual(draws(42));
    expect(draws(42)).not.toEqual(draws(43));
    for (const value of draws(42)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

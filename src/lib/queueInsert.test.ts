import { describe, expect, it } from "vitest";
import { insertIndexAt, queuedEnd } from "./queueInsert";
import type { Track } from "../types";

const song = (id: string, queued?: true): Track => ({ id, title: id, artist: "Artist", thumb: null, queued });

describe("queuedEnd", () => {
  it("ends the user-queued run right after the playing song", () => {
    const queue = [song("cur"), song("q1", true), song("q2", true), song("c1"), song("q3", true)];
    expect(queuedEnd(queue, 0)).toBe(3);
  });

  it("returns the slot after the playing song when nothing is queued", () => {
    expect(queuedEnd([song("cur"), song("c1")], 0)).toBe(1);
  });
});

describe("insertIndexAt", () => {
  const rows = [
    { at: 1, top: 100, height: 56 },
    { at: 2, top: 156, height: 56 },
    { at: 3, top: 212, height: 56 },
  ];

  it("inserts before the first row whose middle is below the pointer", () => {
    expect(insertIndexAt(120, rows, 4)).toBe(1);
    expect(insertIndexAt(190, rows, 4)).toBe(3);
  });

  it("falls back to the end when the pointer is below every row", () => {
    expect(insertIndexAt(400, rows, 4)).toBe(4);
  });
});

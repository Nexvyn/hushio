import { describe, expect, it } from "vitest";
import {
  deletionKey,
  emptyDeletionSync,
  readDeletionSync,
  recordDeletionChanges,
  TOMBSTONE_LIMIT,
} from "./deletionSync";

const none = new Set<string>();

describe("deletion keys", () => {
  it("builds a stable key from the group and id", () => {
    expect(deletionKey("liked", "abc")).toBe('["liked","abc"]');
  });
});

describe("recording changes", () => {
  it("stamps adds and deletes with the clock and keeps the clock moving forward", () => {
    const added = recordDeletionChanges(
      emptyDeletionSync(),
      [{ kind: "add", group: "liked", id: "a" }],
      new Set([deletionKey("liked", "a")]),
      1000,
    );
    expect(added.adds[deletionKey("liked", "a")]).toBe(1000);
    expect(added.clock).toBe(1000);

    const deleted = recordDeletionChanges(added, [{ kind: "delete", group: "liked", id: "a" }], none, 500);
    expect(deleted.deletes[deletionKey("liked", "a")]).toBe(1001);
    expect(deleted.clock).toBe(1001);
  });

  it("drops the add stamp of an item that is no longer live but keeps its tombstone", () => {
    const added = recordDeletionChanges(
      emptyDeletionSync(),
      [{ kind: "add", group: "liked", id: "a" }],
      new Set([deletionKey("liked", "a")]),
      5,
    );
    const removed = recordDeletionChanges(added, [{ kind: "delete", group: "liked", id: "a" }], none, 6);

    expect(removed.adds).toEqual({});
    expect(removed.deletes[deletionKey("liked", "a")]).toBe(6);
  });

  it("clears only history and searches", () => {
    const cleared = recordDeletionChanges(
      emptyDeletionSync(),
      [{ kind: "clear", group: "history" }],
      none,
      10,
    );
    expect(cleared.clears).toEqual({ history: 10 });
  });

  it("keeps only the newest tombstones and raises the floor past the dropped ones", () => {
    let meta = emptyDeletionSync();
    const total = TOMBSTONE_LIMIT + 88;
    for (let index = 1; index <= total; index++) {
      meta = recordDeletionChanges(meta, [{ kind: "delete", group: "liked", id: `s${index}`}], none, index * 10);
    }

    expect(Object.keys(meta.deletes)).toHaveLength(TOMBSTONE_LIMIT);
    expect(meta.floor).toBe(88 * 10);
    expect(Math.min(...Object.values(meta.deletes))).toBeGreaterThan(meta.floor);
  });
});

describe("reading stored deletion data", () => {
  it("treats a payload with another schema as having no deletions", () => {
    expect(readDeletionSync({ schema: 2, clock: 99 })).toEqual(emptyDeletionSync());
    expect(readDeletionSync(null)).toEqual(emptyDeletionSync());
  });

  it("lifts the clock above every stored time", () => {
    const meta = readDeletionSync({ schema: 1, clock: 5, floor: 3, adds: { a: 40 }, deletes: { b: 70 } });
    expect(meta.clock).toBe(70);
    expect(meta.adds).toEqual({ a: 40 });
    expect(meta.deletes).toEqual({ b: 70 });
  });

  it("ignores entries that are not whole numbers", () => {
    const meta = readDeletionSync({ schema: 1, clock: "soon", adds: { a: 1.5, b: 2 } });
    expect(meta.clock).toBe(2);
    expect(meta.adds).toEqual({ b: 2 });
  });
});

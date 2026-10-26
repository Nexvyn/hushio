import { describe, expect, it } from "vitest";
import { arrange, moveKey } from "./libraryOrder";

describe("arrange", () => {
  it("keeps the saved order and drops keys that no longer exist", () => {
    expect(arrange(["a", "b", "c"], ["c", "gone", "a"])).toEqual(["c", "a", "b"]);
  });

  it("removes duplicate saved keys", () => {
    expect(arrange(["a", "b"], ["b", "b", "a"])).toEqual(["b", "a"]);
  });

  it("puts a new default key right after its default predecessor", () => {
    expect(arrange(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
    expect(arrange(["a", "b", "c"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("puts a missing first default key at the front", () => {
    expect(arrange(["a", "b"], ["b"])).toEqual(["a", "b"]);
  });

  it("uses the default order when nothing is saved", () => {
    expect(arrange(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });
});

describe("moveKey", () => {
  it("moves an item up and down", () => {
    expect(moveKey(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveKey(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("returns a copy unchanged when the source is out of range", () => {
    const keys = ["a", "b"];
    const result = moveKey(keys, 5, 0);
    expect(result).toEqual(["a", "b"]);
    expect(result).not.toBe(keys);
  });

  it("does not mutate the input", () => {
    const keys = ["a", "b", "c"];
    moveKey(keys, 0, 2);
    expect(keys).toEqual(["a", "b", "c"]);
  });
});

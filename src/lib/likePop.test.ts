import { describe, expect, it } from "vitest";
import { likeJustAdded } from "./likePop";

describe("likeJustAdded", () => {
  it("is true only when the same track goes from unliked to liked", () => {
    expect(likeJustAdded({ id: "a", liked: false }, { id: "a", liked: true })).toBe(true);
  });

  it("is false for unliking, for a change of track, and for no change", () => {
    expect(likeJustAdded({ id: "a", liked: true }, { id: "a", liked: false })).toBe(false);
    expect(likeJustAdded({ id: "a", liked: false }, { id: "b", liked: true })).toBe(false);
    expect(likeJustAdded({ id: "a", liked: true }, { id: "a", liked: true })).toBe(false);
  });

  it("is false when there is no track", () => {
    expect(likeJustAdded({ id: null, liked: false }, { id: null, liked: true })).toBe(false);
  });
});

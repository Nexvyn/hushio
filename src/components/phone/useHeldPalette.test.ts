import { describe, expect, it } from "vitest";
import { AMBIENT_FALLBACK, type AmbientPair } from "../../lib/artworkPalette";
import { heldPalette } from "./useHeldPalette";

const olive: AmbientPair = { primary: "120 130 40", secondary: "90 100 30" };

describe("heldPalette", () => {
  it("has no colour when the track has no artwork", () => {
    expect(heldPalette({ url: "a", pair: olive }, "")).toBeNull();
  });

  it("has no colour before any artwork has settled", () => {
    expect(heldPalette(null, "b")).toBeNull();
  });

  it("keeps the previous colour while the next cover is still being read", () => {
    expect(heldPalette({ url: "a", pair: olive }, "b")).toBe(olive);
  });

  it("uses the settled colour for the current cover", () => {
    expect(heldPalette({ url: "b", pair: AMBIENT_FALLBACK }, "b")).toBe(AMBIENT_FALLBACK);
  });
});

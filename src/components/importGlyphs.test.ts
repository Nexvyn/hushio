import { describe, expect, it } from "vitest";
import { DURATION_MS } from "../lib/motion";
import { glyphMotion } from "./importGlyphs";

describe("import card glyph motion", () => {
  it("passes no animation props when Reduce Motion is on", () => {
    expect(glyphMotion("noteA", true, true, true).animate).toBeUndefined();
    expect(glyphMotion("ring", true, false, true).animate).toBeUndefined();
    expect(glyphMotion("arrowDown", true, true, true).initial).toEqual({ y: 0, opacity: 1 });
  });

  it("loops the spin token on hover when motion is allowed", () => {
    expect(glyphMotion("arrowDown", true, true, false).animate).toMatchObject({
      transition: { duration: DURATION_MS.spin / 1000, repeat: Infinity },
    });
  });

  it("plays once on the phone and settles on the rest pose", () => {
    expect(glyphMotion("arrowUp", true, false, false).animate).toMatchObject({
      transition: { repeat: 0 },
      transitionEnd: { y: 0, opacity: 1 },
    });
  });

  it("returns to the rest pose when the pointer leaves", () => {
    expect(glyphMotion("noteB", false, true, false).animate).toMatchObject({ opacity: 0, y: 0 });
  });
});

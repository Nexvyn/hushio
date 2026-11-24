import { describe, expect, it } from "vitest";
import { rollSeam, rollStyles } from "./rollUp";

const H = 800;

describe("rollStyles", () => {
  it("is the full page when closed and the full sheet when open", () => {
    expect(rollSeam(0, H)).toBe(H);
    expect(rollSeam(1, H)).toBe(0);
    expect(rollStyles(0, H, false)).toEqual({
      page: "inset(0px 0px 0px 0px round 0px 0px 0px 0px)",
      sheet: `inset(0px 0px 0px 0px round 0px 0px 0px 0px)`,
      shade: 0,
    });
    expect(rollStyles(1, H, false)).toEqual({
      page: `inset(0px 0px ${H}px 0px round 0px 0px 0px 0px)`,
      sheet: `inset(0px 0px 0px 0px round 0px 0px 0px 0px)`,
      shade: 1,
    });
  });

  it("keeps the page edge and the sheet top on the same seam at every progress", () => {
    for (const p of [0, 0.25, 0.5, 0.8, 1]) {
      const sheetOffset = H * (1 - p);
      expect(sheetOffset).toBeCloseTo(rollSeam(p, H), 6);
      const bottom = Number(/^inset\(0px 0px ([\d.]+)px/.exec(rollStyles(p, H, false).page)?.[1]);
      expect(H - bottom).toBeCloseTo(rollSeam(p, H), 6);
    }
  });

  it("clamps progress outside 0 to 1", () => {
    expect(rollStyles(-0.4, H, false).shade).toBe(0);
    expect(rollStyles(1.7, H, false).shade).toBe(1);
  });

  it("returns no clip and no shade on the reduced-motion path", () => {
    expect(rollStyles(0.5, H, true)).toEqual({ page: "none", sheet: "none", shade: 0 });
    expect(rollStyles(1, H, true)).toEqual({ page: "none", sheet: "none", shade: 0 });
  });
});

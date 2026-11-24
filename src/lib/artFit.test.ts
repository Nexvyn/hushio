import { describe, expect, it } from "vitest";
import { artFitFor } from "./artFit";

describe("artFitFor", () => {
  it("fits a 16:9 video thumbnail inside the square slot", () => {
    expect(artFitFor({ naturalWidth: 1280, naturalHeight: 720 })).toBe("contain");
  });

  it("crops square and portrait artwork as before", () => {
    expect(artFitFor({ naturalWidth: 600, naturalHeight: 600 })).toBe("cover");
    expect(artFitFor({ naturalWidth: 480, naturalHeight: 360 })).toBe("cover");
  });

  it("treats an image that has not loaded a size as cover", () => {
    expect(artFitFor({ naturalWidth: 0, naturalHeight: 0 })).toBe("cover");
  });
});

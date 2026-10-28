import { describe, expect, it } from "vitest";
import { canvasClipFor, CANVAS_CACHE_LIMIT, rememberCanvasClip } from "./canvas";

describe("canvas clip cache", () => {
  it("returns nothing for a song without a clip", () => {
    expect(canvasClipFor("canvas-unknown")).toBeNull();
  });

  it("remembers the newest clip for a song", () => {
    rememberCanvasClip("canvas-a", { url: "blob:first" });
    rememberCanvasClip("canvas-a", { url: "blob:second" });
    expect(canvasClipFor("canvas-a")).toEqual({ url: "blob:second" });
  });

  it("drops the oldest clip once the limit is passed", () => {
    rememberCanvasClip("canvas-oldest", { url: "blob:oldest" });
    for (let index = 0; index < CANVAS_CACHE_LIMIT; index++) {
      rememberCanvasClip(`canvas-fill-${index}`, { url: `blob:${index}` });
    }
    expect(canvasClipFor("canvas-oldest")).toBeNull();
    expect(canvasClipFor(`canvas-fill-${CANVAS_CACHE_LIMIT - 1}`)).toEqual({ url: `blob:${CANVAS_CACHE_LIMIT - 1}` });
  });
});

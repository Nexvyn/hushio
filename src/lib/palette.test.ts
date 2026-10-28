import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  artTint,
  artTintFor,
  lchToRgb,
  NEUTRAL_TINT,
  PALETTE_PX,
  readArtwork,
  readCover,
  useArtTint,
} from "./palette";

const PIXELS = PALETTE_PX * PALETTE_PX;

function image(pixel: (index: number) => [number, number, number, number?]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(PIXELS * 4);
  for (let index = 0; index < PIXELS; index++) {
    const [r, g, b, a = 255] = pixel(index);
    data.set([r, g, b, a], index * 4);
  }
  return data;
}

const solid = (r: number, g: number, b: number) => image(() => [r, g, b]);
const rows = (index: number) => Math.floor(index / PALETTE_PX);

describe("readCover", () => {
  it("gives greys no colour and no main hue", () => {
    const read = readCover(solid(128, 128, 128), PALETTE_PX, PALETTE_PX);
    expect(read?.colored).toBe(0);
    expect(read?.main).toBeNull();
    expect(read?.vivid).toBeNull();
  });

  it("returns null when every pixel is too dark to count", () => {
    expect(readCover(solid(0, 0, 0), PALETTE_PX, PALETTE_PX)).toBeNull();
  });

  it("skips transparent pixels", () => {
    expect(readCover(image(() => [220, 30, 30, 0]), PALETTE_PX, PALETTE_PX)).toBeNull();
  });

  it("reads a saturated red cover as a red hue with almost full colour share", () => {
    const read = readCover(solid(220, 30, 30), PALETTE_PX, PALETTE_PX);
    expect(read?.main?.h).toBeGreaterThan(20);
    expect(read?.main?.h).toBeLessThan(40);
    expect(read?.colored).toBeGreaterThan(0.95);
  });

  it("lets the coloured share decide whether a hue is the main colour", () => {
    const read = readCover(
      image((index) => (index % 10 < 3 ? [30, 60, 220] : [128, 128, 128])),
      PALETTE_PX,
      PALETTE_PX,
    );
    expect(read?.colored).toBeCloseTo(0.3, 1);
    expect(read?.main?.h).toBeGreaterThan(240);
    expect(read?.main?.h).toBeLessThan(290);
  });

  it("treats a cover with too little colour as black and white", () => {
    const read = readCover(
      image((index) => (index % 100 === 0 ? [30, 60, 220] : [128, 128, 128])),
      PALETTE_PX,
      PALETTE_PX,
    );
    expect(read?.colored).toBeLessThan(0.06);
    expect(read?.main).toBeNull();
  });

  it("reads the edge colour from the bottom 18 percent of rows", () => {
    const read = readCover(
      image((index) => (rows(index) >= 52 ? [220, 30, 30] : [128, 128, 128])),
      PALETTE_PX,
      PALETTE_PX,
    );
    expect(read?.edge.h).toBeGreaterThan(20);
    expect(read?.edge.h).toBeLessThan(40);
    expect(read?.edge.c).toBeGreaterThan(0.1);
  });
});

function oklabLightness([r, g, b]: number[]): number {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [lr, lg, lb] = linear;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

describe("artTint", () => {
  it("falls back to the neutral tint when the cover cannot be read", () => {
    expect(artTint(null)).toBe(NEUTRAL_TINT);
  });

  it("reads a solid red cover as a red hue", () => {
    const read = readCover(solid(220, 30, 30), PALETTE_PX, PALETTE_PX);
    expect(read?.main).not.toBeNull();
    expect(Math.abs((read?.main?.h ?? 0) - 29)).toBeLessThan(10);
  });

  it("lifts a dark red cover to the same background lightness as a bright one", () => {
    const dark = artTint(readCover(solid(40, 10, 10), PALETTE_PX, PALETTE_PX)).split(" ").map(Number);
    const bright = artTint(readCover(solid(220, 30, 30), PALETTE_PX, PALETTE_PX)).split(" ").map(Number);
    expect(oklabLightness(dark)).toBeCloseTo(oklabLightness(bright), 1);
    expect(oklabLightness(dark)).toBeGreaterThan(0.2);
    expect(oklabLightness(dark)).toBeLessThan(0.27);
  });

  it("tints a black and white cover with a grey", () => {
    const tint = artTint(readCover(solid(128, 128, 128), PALETTE_PX, PALETTE_PX));
    const channels = tint.split(" ");
    expect(new Set(channels).size).toBe(1);
  });

  it("keeps the tint dark and in the cover's hue", () => {
    const [r, g, b] = artTint(readCover(solid(220, 30, 30), PALETTE_PX, PALETTE_PX)).split(" ").map(Number);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
    expect(Math.max(r, g, b)).toBeLessThan(90);
  });
});

describe("lchToRgb", () => {
  it("returns equal channels for a colour with no chroma", () => {
    const [r, g, b] = lchToRgb({ l: 0.5, c: 0, h: 0 });
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it("pulls an out-of-gamut colour back into whole byte values", () => {
    const channels = lchToRgb({ l: 0.5, c: 0.4, h: 150 });
    for (const channel of channels) {
      expect(Number.isInteger(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});

describe("artwork reading", () => {
  let pixels: Uint8ClampedArray;
  let getImageData: ReturnType<typeof vi.fn>;
  let drawImage: ReturnType<typeof vi.fn>;
  const failing = new Set<string>();
  const blank = new Set<string>();

  class FakeImage {
    crossOrigin = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private current = "";

    get naturalWidth() {
      return blank.has(this.current) ? 0 : 64;
    }

    set src(value: string) {
      this.current = value;
      queueMicrotask(() => {
        if (failing.has(value)) this.onerror?.();
        else this.onload?.();
      });
    }

    get src() {
      return this.current;
    }
  }

  beforeEach(() => {
    pixels = solid(220, 30, 30);
    getImageData = vi.fn(() => ({ data: pixels }));
    drawImage = vi.fn();
    vi.stubGlobal("Image", FakeImage);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    failing.clear();
    blank.clear();
  });

  it("draws the image to a 64 by 64 canvas and reads its pixels", async () => {
    const read = await readArtwork("https://i.example.test/red.jpg");
    expect(read?.main).not.toBeNull();
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, PALETTE_PX, PALETTE_PX);
    expect(getImageData).toHaveBeenCalledWith(0, 0, PALETTE_PX, PALETTE_PX);
  });

  it("returns null for an image that fails to load", async () => {
    failing.add("https://i.example.test/broken.jpg");
    expect(await readArtwork("https://i.example.test/broken.jpg")).toBeNull();
  });

  it("returns null for an image with no natural width", async () => {
    blank.add("https://i.example.test/empty.jpg");
    expect(await readArtwork("https://i.example.test/empty.jpg")).toBeNull();
    expect(getImageData).not.toHaveBeenCalled();
  });

  it("reads each cover once and serves later requests from the cache", async () => {
    const url = "https://i.example.test/cached.jpg";
    const first = await artTintFor(url);
    const second = await artTintFor(url);
    expect(second).toBe(first);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("starts with the neutral tint and then shows the cover's tint", async () => {
    const url = "https://i.example.test/hook.jpg";
    const { result } = renderHook(({ source }) => useArtTint(source), { initialProps: { source: url } });
    expect(result.current).toBe(NEUTRAL_TINT);
    await waitFor(() => expect(result.current).not.toBe(NEUTRAL_TINT));
    const [r, g, b] = result.current.split(" ").map(Number);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("uses the neutral tint when there is no cover", () => {
    const { result } = renderHook(() => useArtTint(""));
    expect(result.current).toBe(NEUTRAL_TINT);
  });

  it("uses the neutral tint for a cover that cannot be read", async () => {
    failing.add("https://i.example.test/unreadable.jpg");
    expect(await artTintFor("https://i.example.test/unreadable.jpg")).toBe(NEUTRAL_TINT);
  });
});

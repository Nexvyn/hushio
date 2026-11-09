import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  AMBIENT_FALLBACK,
  LruCache,
  ambientFor,
  applyAmbientVars,
  binDistance,
  extractAmbient,
  formatRgb,
  hueBin,
  hueDegrees,
  parseRgb,
  pixelGate,
  pixelWeight,
  readAmbient,
  saturation,
  shiftBin,
  useArtworkPalette,
} from "./artworkPalette";

function pixels(...groups: Array<[number, number, number, number, number?]>): Uint8ClampedArray {
  const total = groups.reduce((sum, group) => sum + group[3], 0);
  const data = new Uint8ClampedArray(total * 4);
  let index = 0;
  for (const [r, g, b, count, alpha = 255] of groups) {
    for (let n = 0; n < count; n++, index++) data.set([r, g, b, alpha], index * 4);
  }
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--ambient-0");
  document.documentElement.style.removeProperty("--ambient-1");
});

describe("pixel gate", () => {
  it("skips near black and near white", () => {
    expect(pixelGate(0, 0, 0)).toBe(false);
    expect(pixelGate(255, 255, 255)).toBe(false);
  });

  it("keeps mid tones", () => {
    expect(pixelGate(128, 128, 128)).toBe(true);
    expect(pixelGate(200, 60, 30)).toBe(true);
  });
});

describe("saturation and weight", () => {
  it("is zero for grey and one for a pure colour", () => {
    expect(saturation(120, 120, 120)).toBe(0);
    expect(saturation(255, 0, 0)).toBe(1);
    expect(saturation(0, 0, 0)).toBe(0);
  });

  it("weights saturated pixels above grey and keeps a floor", () => {
    expect(pixelWeight(120, 120, 120)).toBeCloseTo(0.02, 6);
    expect(pixelWeight(255, 0, 0)).toBeGreaterThan(pixelWeight(120, 120, 120));
    expect(pixelWeight(120, 120, 120)).toBeGreaterThan(0);
  });
});

describe("hue bins", () => {
  it("maps primaries into the expected 20 degree bins", () => {
    expect(hueDegrees(255, 0, 0)).toBe(0);
    expect(hueBin(255, 0, 0)).toBe(0);
    expect(hueBin(0, 255, 0)).toBe(6);
    expect(hueBin(0, 0, 255)).toBe(12);
  });

  it("returns zero hue for grey", () => {
    expect(hueDegrees(90, 90, 90)).toBe(0);
  });

  it("measures circular distance between bins", () => {
    expect(binDistance(0, 17)).toBe(1);
    expect(binDistance(0, 9)).toBe(9);
    expect(binDistance(2, 5)).toBe(3);
  });
});

describe("extractAmbient", () => {
  it("picks the dominant hue as primary with clamped channels", () => {
    const { primary } = extractAmbient(pixels([255, 0, 0, 900]));
    expect(primary).toBe("255 28 28");
  });

  it("chooses a secondary at least 60 degrees away", () => {
    const { primary, secondary } = extractAmbient(pixels([255, 0, 0, 600], [90, 120, 255, 300]));
    expect(primary).toBe("255 28 28");
    expect(secondary).toBe("90 120 255");
  });

  it("shifts the primary when no far bin has colour", () => {
    const { primary, secondary } = extractAmbient(pixels([255, 0, 0, 500], [255, 128, 0, 400]));
    expect(primary).toBe("255 28 28");
    expect(secondary).toBe(shiftBin(0));
    expect(secondary).not.toBe(primary);
  });

  it("uses the shift rule for a single colour", () => {
    expect(extractAmbient(pixels([90, 120, 255, 800])).secondary).toBe(shiftBin(11));
  });

  it("ignores transparent and gated pixels", () => {
    expect(extractAmbient(pixels([0, 0, 255, 1000, 0], [255, 0, 0, 10])).primary).toBe("255 28 28");
    expect(extractAmbient(pixels([0, 0, 0, 500], [255, 255, 255, 500]))).toEqual(AMBIENT_FALLBACK);
  });

  it("resets to the fallback when nothing is readable", () => {
    expect(extractAmbient(pixels([255, 0, 0, 100, 0]))).toEqual(AMBIENT_FALLBACK);
  });
});

describe("shift and formatting", () => {
  it("returns a valid triplet for every bin", () => {
    for (let bin = 0; bin < 18; bin++) {
      const triplet = parseRgb(shiftBin(bin));
      for (const channel of triplet) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it("round trips rgb text", () => {
    expect(formatRgb(parseRgb("12 200 9"))).toBe("12 200 9");
  });
});

describe("LRU cache", () => {
  it("evicts the oldest entry at capacity", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
    expect(cache.size).toBe(2);
  });

  it("moves a hit to the newest slot", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("misses cleanly", () => {
    expect(new LruCache<string, number>(1).get("x")).toBeUndefined();
  });
});

describe("loading", () => {
  function failingImage() {
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        crossOrigin = "";
        naturalWidth = 0;
        set src(_value: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      },
    );
  }

  it("returns the neutral ambient fallback when the image fails", async () => {
    failingImage();
    await expect(readAmbient("https://example.test/a.jpg")).resolves.toEqual(AMBIENT_FALLBACK);
  });

  it("returns the fallback for an empty url without loading", async () => {
    await expect(ambientFor("")).resolves.toEqual(AMBIENT_FALLBACK);
  });

  it("caches one promise per url", () => {
    failingImage();
    const first = ambientFor("https://example.test/cached.jpg");
    expect(ambientFor("https://example.test/cached.jpg")).toBe(first);
  });

  it("the hook shows the fallback for a new url until it settles", async () => {
    failingImage();
    const { result } = renderHook(({ url }) => useArtworkPalette(url), { initialProps: { url: "https://example.test/hook.jpg" } });
    expect(result.current).toEqual(AMBIENT_FALLBACK);
    await waitFor(() => expect(result.current).toEqual(AMBIENT_FALLBACK));
  });
});

describe("ambient vars", () => {
  it("writes both colours on the root element", () => {
    applyAmbientVars({ primary: "10 20 30", secondary: "40 50 60" });
    expect(document.documentElement.style.getPropertyValue("--ambient-0")).toBe("10 20 30");
    expect(document.documentElement.style.getPropertyValue("--ambient-1")).toBe("40 50 60");
  });
});

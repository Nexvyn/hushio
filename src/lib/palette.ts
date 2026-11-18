import { onMemoryTrim } from "./memoryTrim";
import { useEffect, useState } from "react";

export type Lch = { l: number; c: number; h: number };

export type CoverRead = {
  lightness: number;
  colored: number;
  main: Lch | null;
  vivid: Lch | null;
  edge: Lch;
};

export const PALETTE_PX = 64;
const READ_CACHE_ENTRIES = 50;
export const NEUTRAL_TINT = "13 13 15";

const CHROMA_FROM = 0.03;
const CHROMA_FULL = 0.06;
const DARK = 0.12;
const COLORED_MIN = 0.06;
const BINS = 36;
const FAMILY_MIN = 0.01;
const VIVID_MIN = 0.015;
const EDGE_FROM = 0.82;
const DEFAULT_EDGE: Lch = { l: 0.2, c: 0, h: 0 };
const GREY_BACKGROUND = 0.22;
const BACKGROUND_L = 0.235;

const SRGB_LINEAR = Array.from({ length: 256 }, (_, value) => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

type Sums = { area: number; l: number; a: number; b: number; c: number };

function emptySums(): Sums {
  return { area: 0, l: 0, a: 0, b: 0, c: 0 };
}

function srgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = SRGB_LINEAR[r];
  const lg = SRGB_LINEAR[g];
  const lb = SRGB_LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut([r, g, b]: [number, number, number]): boolean {
  const edge = 1e-4;
  return [r, g, b].every((value) => value >= -edge && value <= 1 + edge);
}

function encode(linear: number): number {
  const c = Math.min(1, Math.max(0, linear));
  const srgb = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

function hueOf(a: number, b: number): number {
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  return degrees < 0 ? degrees + 360 : degrees;
}

function lchOf(l: number, a: number, b: number): Lch {
  return { l, c: Math.hypot(a, b), h: hueOf(a, b) };
}

function colourWeight(chroma: number): number {
  const t = Math.min(1, Math.max(0, (chroma - CHROMA_FROM) / (CHROMA_FULL - CHROMA_FROM)));
  return t * t * (3 - 2 * t);
}

function familyOf(bins: Sums[], index: number): Sums {
  const total = emptySums();
  for (const offset of [-1, 0, 1]) {
    const bin = bins[(index + offset + BINS) % BINS];
    total.area += bin.area;
    total.l += bin.l;
    total.a += bin.a;
    total.b += bin.b;
    total.c += bin.c;
  }
  return total;
}

function meanLch(sums: Sums): Lch {
  return { l: sums.l / sums.area, c: sums.c / sums.area, h: hueOf(sums.a, sums.b) };
}

export function lchToRgb(lch: Lch): [number, number, number] {
  const radians = (lch.h * Math.PI) / 180;
  const linearAt = (chroma: number) =>
    oklabToLinear(lch.l, chroma * Math.cos(radians), chroma * Math.sin(radians));
  let chroma = lch.c;
  if (!inGamut(linearAt(lch.c))) {
    let low = 0;
    let high = lch.c;
    for (let step = 0; step < 18; step++) {
      const mid = (low + high) / 2;
      if (inGamut(linearAt(mid))) low = mid;
      else high = mid;
    }
    chroma = low;
  }
  const [r, g, b] = linearAt(chroma);
  return [encode(r), encode(g), encode(b)];
}

function muddy(h: number): boolean {
  return h >= 35 && h <= 115;
}

function darkChroma(c: number, h: number, cap: number): number {
  if (muddy(h) && c < 0.1) return Math.min(c * 0.2, 0.012);
  return Math.min(c, cap);
}

export function readCover(rgba: ArrayLike<number>, width: number, height: number): CoverRead | null {
  const edgeRow = Math.floor(height * EDGE_FROM);
  const bins = Array.from({ length: BINS }, emptySums);
  let lightnessSum = 0;
  let opaque = 0;
  let counted = 0;
  let colouredWeight = 0;
  let edgeL = 0;
  let edgeA = 0;
  let edgeB = 0;
  let edgeCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 128) continue;
      const [L, A, B] = srgbToOklab(rgba[i], rgba[i + 1], rgba[i + 2]);
      opaque++;
      lightnessSum += L;
      if (y >= edgeRow) {
        edgeL += L;
        edgeA += A;
        edgeB += B;
        edgeCount++;
      }
      if (L < DARK) continue;
      counted++;
      const chroma = Math.hypot(A, B);
      const weight = colourWeight(chroma);
      colouredWeight += weight;
      if (weight === 0) continue;
      const bin = bins[Math.floor((hueOf(A, B) / 360) * BINS) % BINS];
      bin.area += weight;
      bin.l += weight * L;
      bin.a += weight * A;
      bin.b += weight * B;
      bin.c += weight * chroma;
    }
  }

  if (counted === 0) return null;
  const colored = colouredWeight / counted;
  const edge = edgeCount > 0 ? lchOf(edgeL / edgeCount, edgeA / edgeCount, edgeB / edgeCount) : DEFAULT_EDGE;
  const lightness = lightnessSum / opaque;
  if (colored < COLORED_MIN) return { lightness, colored, main: null, vivid: null, edge };

  let main: Lch | null = null;
  let mainScore = -Infinity;
  let vivid: Lch | null = null;
  let vividScore = -Infinity;
  for (let index = 0; index < BINS; index++) {
    if (bins[index].area === 0) continue;
    const family = familyOf(bins, index);
    const share = family.area / counted;
    if (share < FAMILY_MIN) continue;
    const chroma = family.c / family.area;
    const cam = chroma * 370;
    const score = 70 * share + (cam - 48) * (cam < 48 ? 0.1 : 0.3);
    const candidate = meanLch(family);
    if (score > mainScore) {
      mainScore = score;
      main = candidate;
    }
    if (share >= VIVID_MIN) {
      const value = chroma * chroma * Math.sqrt(share);
      if (value > vividScore) {
        vividScore = value;
        vivid = candidate;
      }
    }
  }

  return { lightness, colored, main, vivid: vivid ?? main, edge };
}

function rgbText([r, g, b]: [number, number, number]): string {
  return `${r} ${g} ${b}`;
}

export function artTint(read: CoverRead | null): string {
  if (!read) return NEUTRAL_TINT;
  if (!read.main) return rgbText(lchToRgb({ l: GREY_BACKGROUND, c: 0, h: 0 }));
  const amount = 0.55 + 0.45 * Math.min(1, Math.max(0, (read.colored - COLORED_MIN) / 0.3));
  const chroma = darkChroma(read.main.c * amount, read.main.h, 0.13);
  return rgbText(lchToRgb({ l: BACKGROUND_L, c: Math.min(chroma * 0.6, 0.07), h: read.main.h }));
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

export async function readArtwork(url: string): Promise<CoverRead | null> {
  const image = await loadImage(url);
  if (!image || image.naturalWidth === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = PALETTE_PX;
  canvas.height = PALETTE_PX;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, PALETTE_PX, PALETTE_PX);
  try {
    const { data } = context.getImageData(0, 0, PALETTE_PX, PALETTE_PX);
    return readCover(data, PALETTE_PX, PALETTE_PX);
  } catch {
    return null;
  }
}

const tintCache = new Map<string, Promise<string>>();
onMemoryTrim(() => tintCache.clear());

export function artTintFor(url: string): Promise<string> {
  const cached = tintCache.get(url);
  if (cached) {
    tintCache.delete(url);
    tintCache.set(url, cached);
    return cached;
  }
  const tint = readArtwork(url).then(artTint);
  tintCache.set(url, tint);
  if (tintCache.size > READ_CACHE_ENTRIES) {
    const oldest = tintCache.keys().next().value;
    if (oldest !== undefined) tintCache.delete(oldest);
  }
  return tint;
}

export function useArtTint(url: string): string {
  const [settled, setSettled] = useState({ url: "", tint: NEUTRAL_TINT });

  useEffect(() => {
    if (!url) return;
    let live = true;
    void artTintFor(url).then((tint) => {
      if (live) setSettled({ url, tint });
    });
    return () => {
      live = false;
    };
  }, [url]);

  return settled.url === url ? settled.tint : NEUTRAL_TINT;
}

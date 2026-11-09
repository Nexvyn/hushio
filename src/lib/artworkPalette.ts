import { useEffect, useState } from "react";

export type AmbientPair = { primary: string; secondary: string };
export type Rgb = [number, number, number];

export const AMBIENT_FALLBACK: AmbientPair = { primary: "60 60 64", secondary: "40 40 44" };
const PALETTE_GRID = 30;
const HUE_BINS = 18;
const READ_CACHE_ENTRIES = 128;

const LUM_MIN = 0.08;
const LUM_MAX = 0.95;
const CHANNEL_MIN = 28;
const SECONDARY_MIN_DISTANCE = 3;
const SHIFT_SATURATION = 0.42;
const SHIFT_LIGHTNESS = 0.34;
const SHIFT_BINS = 4;

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function pixelGate(r: number, g: number, b: number): boolean {
  const lum = luminance(r, g, b);
  return lum >= LUM_MIN && lum <= LUM_MAX;
}

export function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

export function pixelWeight(r: number, g: number, b: number): number {
  const sat = saturation(r, g, b);
  const lum = luminance(r, g, b);
  return sat ** 1.25 * (0.35 + 0.65 * (1 - Math.abs(lum - 0.45) * 1.6)) + 0.02;
}

export function hueDegrees(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  const degrees = hue * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

export function hueBin(r: number, g: number, b: number): number {
  return Math.floor(hueDegrees(r, g, b) / (360 / HUE_BINS)) % HUE_BINS;
}

export function binDistance(a: number, b: number): number {
  const direct = Math.abs(a - b) % HUE_BINS;
  return Math.min(direct, HUE_BINS - direct);
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - chroma / 2;
  const sector = Math.floor((h * 6) % 6);
  const [r, g, b] =
    sector === 0 ? [chroma, x, 0]
    : sector === 1 ? [x, chroma, 0]
    : sector === 2 ? [0, chroma, x]
    : sector === 3 ? [0, x, chroma]
    : sector === 4 ? [x, 0, chroma]
    : [chroma, 0, x];
  return [clampChannel((r + m) * 255), clampChannel((g + m) * 255), clampChannel((b + m) * 255)];
}

export function formatRgb([r, g, b]: Rgb): string {
  return `${r} ${g} ${b}`;
}

export function parseRgb(text: string): Rgb {
  const [r = 0, g = 0, b = 0] = text.trim().split(/\s+/).map((part) => Number.parseInt(part, 10));
  return [r, g, b];
}

export function shiftBin(bin: number): string {
  const h = ((bin + SHIFT_BINS) % HUE_BINS) / HUE_BINS;
  return formatRgb(hslToRgb(h, SHIFT_SATURATION, SHIFT_LIGHTNESS));
}

type BinSums = { weight: number; r: number; g: number; b: number };

function accumulate(rgba: ArrayLike<number>): BinSums[] {
  const bins: BinSums[] = Array.from({ length: HUE_BINS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    if (!pixelGate(r, g, b)) continue;
    const weight = pixelWeight(r, g, b);
    const bin = bins[hueBin(r, g, b)];
    bin.weight += weight;
    bin.r += weight * r;
    bin.g += weight * g;
    bin.b += weight * b;
  }
  return bins;
}

function binColour(bin: BinSums): string {
  const channel = (sum: number) => clampChannel(Math.max(CHANNEL_MIN, sum / bin.weight));
  return formatRgb([channel(bin.r), channel(bin.g), channel(bin.b)]);
}

export function extractAmbient(rgba: ArrayLike<number>): AmbientPair {
  const bins = accumulate(rgba);
  let primary = -1;
  for (let i = 0; i < HUE_BINS; i++) {
    if (bins[i].weight > 0 && (primary < 0 || bins[i].weight > bins[primary].weight)) primary = i;
  }
  if (primary < 0) return AMBIENT_FALLBACK;
  let secondary = -1;
  for (let i = 0; i < HUE_BINS; i++) {
    if (binDistance(i, primary) < SECONDARY_MIN_DISTANCE || bins[i].weight <= 0) continue;
    if (secondary < 0 || bins[i].weight > bins[secondary].weight) secondary = i;
  }
  return {
    primary: binColour(bins[primary]),
    secondary: secondary >= 0 ? binColour(bins[secondary]) : shiftBin(primary),
  };
}

export class LruCache<K, V> {
  private readonly limit: number;
  private readonly entries = new Map<K, V>();

  constructor(limit: number) {
    this.limit = limit;
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: K): boolean {
    return this.entries.has(key);
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key) as V;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value as K;
      this.entries.delete(oldest);
    }
  }
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

export async function readAmbient(url: string): Promise<AmbientPair> {
  if (!url) return AMBIENT_FALLBACK;
  const image = await loadImage(url);
  if (!image || image.naturalWidth === 0) return AMBIENT_FALLBACK;
  const canvas = document.createElement("canvas");
  canvas.width = PALETTE_GRID;
  canvas.height = PALETTE_GRID;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return AMBIENT_FALLBACK;
  context.drawImage(image, 0, 0, PALETTE_GRID, PALETTE_GRID);
  try {
    return extractAmbient(context.getImageData(0, 0, PALETTE_GRID, PALETTE_GRID).data);
  } catch {
    return AMBIENT_FALLBACK;
  }
}

const cache = new LruCache<string, Promise<AmbientPair>>(READ_CACHE_ENTRIES);

export function ambientFor(url: string): Promise<AmbientPair> {
  if (!url) return Promise.resolve(AMBIENT_FALLBACK);
  const cached = cache.get(url);
  if (cached) return cached;
  const pending = readAmbient(url);
  cache.set(url, pending);
  return pending;
}

export function applyAmbientVars(pair: AmbientPair, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--ambient-0", pair.primary);
  root.style.setProperty("--ambient-1", pair.secondary);
}

export function useArtworkPalette(url: string): AmbientPair {
  const [settled, setSettled] = useState<{ url: string; pair: AmbientPair }>({ url: "", pair: AMBIENT_FALLBACK });

  useEffect(() => {
    if (!url) return;
    let live = true;
    void ambientFor(url).then((pair) => {
      if (live) setSettled({ url, pair });
    });
    return () => {
      live = false;
    };
  }, [url]);

  return settled.url === url ? settled.pair : AMBIENT_FALLBACK;
}

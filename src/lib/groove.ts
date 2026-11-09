import { fmtTime } from "./format";

const SEEK_SHORT_S = 5;
const SEEK_LONG_S = 15;
const RUBBER_COEFFICIENT = 0.25;

export type GrooveSize = { bar: number; hill: number; knob: number };

export const GROOVE_SIZES = {
  stage: { bar: 6, hill: 7, knob: 14 },
  bar: { bar: 4, hill: 4, knob: 10 },
  compact: { bar: 3, hill: 3, knob: 8 },
} satisfies Record<string, GrooveSize>;

export type GrooveProfile = keyof typeof GROOVE_SIZES;

const GROOVE_WAVE_WAVELENGTH_PX = 140;
const GROOVE_WAVE_SPEED_PX_S = 28;
const GROOVE_BREATH_PERIOD_S = 3.2;
export const GROOVE_BACK_LAYER_ALPHA = 0.45;
export const GROOVE_HIT_MIN_PX = 28;
const GROOVE_WAVE_EASE_S = 0.4;
export const GROOVE_WAVE_FRAME_MS = 33;
export const GROOVE_WAVE_MAX_DT_S = 0.1;

export type LyricPoint = { time: number; text: string };

export function grooveSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wavePhases(seed: number): [number, number, number] {
  const next = seeded(seed);
  return [next() * Math.PI * 2, next() * Math.PI * 2, next() * Math.PI * 2];
}

function ribbonNoise(x: number, timeSec: number, seed: number, shift = 0): number {
  const [a, b, c] = wavePhases(seed);
  const k = (Math.PI * 2) / GROOVE_WAVE_WAVELENGTH_PX;
  const along = x + shift - timeSec * GROOVE_WAVE_SPEED_PX_S;
  return (Math.sin(along * k + a) + 0.5 * Math.sin(along * k * 2.3 + b) + 0.25 * Math.sin(along * k * 0.45 + c)) / 1.75;
}

export function hillEnvelope(u: number): number {
  return Math.pow(Math.sin(Math.PI * clamp01(u)), 1.2);
}

export function hillOffset(
  x: number,
  progressX: number,
  timeSec: number,
  seed: number,
  layer: 0 | 1,
  size: GrooveSize,
  level: number,
): number {
  if (!(progressX > 0)) return 0;
  const along = Math.min(progressX, Math.max(0, x));
  const shift = layer === 0 ? GROOVE_WAVE_WAVELENGTH_PX * 0.4 : 0;
  const shape = 0.45 + 0.55 * ((ribbonNoise(along, timeSec, seed, shift) + 1) / 2);
  const breath = 1 + 0.04 * clamp01(level) * Math.sin((Math.PI * 2 * timeSec) / GROOVE_BREATH_PERIOD_S);
  return Math.min(size.hill, Math.max(0, size.hill * hillEnvelope(along / progressX) * shape * breath));
}

export function grooveBoxHeight(size: GrooveSize): number {
  return size.hill + size.knob;
}

export function stepWaveLevel(level: number, target: number, dt: number): number {
  const step = dt / GROOVE_WAVE_EASE_S;
  if (target > level) return Math.min(target, level + step);
  return Math.max(target, level - step);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function ratioAt(offset: number, size: number): number {
  return size > 0 ? clamp01(offset / size) : 0;
}

export function rubberBandOffset(overshoot: number, size: number): number {
  if (overshoot === 0 || size <= 0) return 0;
  const magnitude = Math.abs(overshoot);
  const banded = (1 - 1 / ((magnitude * RUBBER_COEFFICIENT) / size + 1)) * size;
  return Math.sign(overshoot) * banded;
}

export function seekTarget(key: string, shift: boolean, position: number, duration: number): number | null {
  const within = (seconds: number) => Math.min(duration, Math.max(0, seconds));
  const step = shift ? SEEK_LONG_S : SEEK_SHORT_S;
  switch (key) {
    case "ArrowLeft":
      return within(position - step);
    case "ArrowRight":
      return within(position + step);
    case "Home":
      return 0;
    case "End":
      return Math.max(0, duration);
    default:
      return null;
  }
}

export function lyricAt(lines: readonly LyricPoint[], time: number): string | null {
  let text: string | null = null;
  for (const line of lines) {
    if (line.time > time) break;
    text = line.text;
  }
  return text;
}

export function grooveValueText(position: number, duration: number): string {
  return `${fmtTime(position)} of ${fmtTime(duration)}`;
}

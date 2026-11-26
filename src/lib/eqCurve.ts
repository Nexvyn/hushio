import { EQ_BANDS_HZ, EQ_RANGE, clampEqGain, formatEqGain, sameGains } from "./eq";

export type Point = { x: number; y: number };

export const DISPLAY_HZ = [60, 150, 400, 1000, 2400, 6000, 14000] as const;
export const DISPLAY_LABELS = ["60", "150", "400", "1k", "2.4k", "6k", "14k"] as const;
export const EQ_PLOT_ASPECT = "1000 / 460";
const EQ_X_INSET = 0.11;
export const EQ_Y_PAD = 0.09;

export const EQ_MOODS: Readonly<Record<string, readonly number[]>> = {
  Flat: [0, 0, 0, 0, 0, 0, 0],
  Warm: [8, 6, 2, -2, -4, -4, -6],
  Air: [-4, -2, 0, 2, 4, 6, 8],
  Night: [-8, -4, 0, 4, 4, -2, -6],
};

export function bandFraction(index: number, count: number): number {
  return EQ_X_INSET + (index / (count - 1)) * (1 - 2 * EQ_X_INSET);
}

export function gainToFraction(gain: number): number {
  const clamped = Math.min(EQ_RANGE, Math.max(-EQ_RANGE, gain));
  return EQ_Y_PAD + (1 - (clamped + EQ_RANGE) / (2 * EQ_RANGE)) * (1 - 2 * EQ_Y_PAD);
}

export function fractionToGain(fraction: number): number {
  return clampEqGain((1 - (fraction - EQ_Y_PAD) / (1 - 2 * EQ_Y_PAD)) * 2 * EQ_RANGE - EQ_RANGE);
}

export function sampleCurve(freqs: readonly number[], gains: readonly number[], targets: readonly number[]): number[] {
  const last = freqs.length - 1;
  return targets.map((hz) => {
    if (hz <= freqs[0]) return gains[0] ?? 0;
    if (hz >= freqs[last]) return gains[last] ?? 0;
    let i = 0;
    while (i < last - 1 && hz > freqs[i + 1]) i++;
    const t = (Math.log(hz) - Math.log(freqs[i])) / (Math.log(freqs[i + 1]) - Math.log(freqs[i]));
    return (gains[i] ?? 0) + ((gains[i + 1] ?? 0) - (gains[i] ?? 0)) * t;
  });
}

export function displayToEngine(display: readonly number[]): number[] {
  return sampleCurve(DISPLAY_HZ, display, EQ_BANDS_HZ).map(clampEqGain);
}

export function engineToDisplay(engine: readonly number[]): number[] {
  return sampleCurve(EQ_BANDS_HZ, engine, DISPLAY_HZ).map(clampEqGain);
}

export function moodMatching(display: readonly number[]): string | null {
  return Object.keys(EQ_MOODS).find((name) => sameGains(EQ_MOODS[name], display)) ?? null;
}

export function curveAnchors(points: readonly Point[], width: number): Point[] {
  if (points.length === 0) return [];
  return [{ x: 0, y: points[0].y }, ...points, { x: width, y: points[points.length - 1].y }];
}

export function splineSamples(points: readonly Point[], perSegment = 12): Point[] {
  const count = points.length;
  if (count < 2) return points.map((point) => ({ ...point }));
  const widths: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    widths.push(dx);
    slopes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }
  const tangents: number[] = new Array(count);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let i = 1; i < count - 1; i++) {
    const before = slopes[i - 1];
    const after = slopes[i];
    if (before * after <= 0) {
      tangents[i] = 0;
    } else {
      const limit = 3 * Math.min(Math.abs(before), Math.abs(after));
      tangents[i] = Math.sign(before) * Math.min(Math.abs((before + after) / 2), limit);
    }
  }
  const samples: Point[] = [];
  for (let i = 0; i < count - 1; i++) {
    const h = widths[i];
    const a = points[i];
    const b = points[i + 1];
    for (let step = 0; step < perSegment; step++) {
      const t = step / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      samples.push({
        x: a.x + t * h,
        y:
          (2 * t3 - 3 * t2 + 1) * a.y +
          (t3 - 2 * t2 + t) * h * tangents[i] +
          (-2 * t3 + 3 * t2) * b.y +
          (t3 - t2) * h * tangents[i + 1],
      });
    }
  }
  samples.push({ ...points[count - 1] });
  return samples;
}

export function lerpGains(from: readonly number[], to: readonly number[], t: number): number[] {
  const amount = Math.min(1, Math.max(0, t));
  return to.map((target, index) => {
    const start = from[index] ?? target;
    return start + (target - start) * amount;
  });
}

export function bandSpoken(hz: number): string {
  return hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
}

export function eqValueText(hz: number, gain: number): string {
  return `${formatEqGain(gain)} dB at ${bandSpoken(hz)}`;
}

export function keyGain(gain: number, key: string): number | null {
  switch (key) {
    case "ArrowUp":
    case "ArrowRight":
      return clampEqGain(gain + 1);
    case "ArrowDown":
    case "ArrowLeft":
      return clampEqGain(gain - 1);
    case "PageUp":
      return clampEqGain(gain + 3);
    case "PageDown":
      return clampEqGain(gain - 3);
    case "Home":
      return -EQ_RANGE;
    case "End":
      return EQ_RANGE;
    default:
      return null;
  }
}

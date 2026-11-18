const DECELERATION_NORMAL = 0.998;
const RUBBER_BAND_C = 0.55;

export function projectDistance(velocityPxPerS: number): number {
  return ((velocityPxPerS / 1000) * DECELERATION_NORMAL) / (1 - DECELERATION_NORMAL);
}

export function landsPast(offset: number, velocity: number, threshold: number): boolean {
  const landing = offset + projectDistance(velocity);
  return Math.sign(landing) === Math.sign(offset) && Math.abs(landing) >= threshold;
}

export function rubberBand(offset: number, dimension: number): number {
  if (dimension <= 0 || offset === 0) return 0;
  const pull = Math.abs(offset);
  const shown = (1 - 1 / ((RUBBER_BAND_C * pull) / dimension + 1)) * dimension;
  return Math.sign(offset) * shown;
}

export function rubberBandEdge(raw: number, dimension: number): number {
  return raw < 0 ? rubberBand(raw, dimension) : raw;
}

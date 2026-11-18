export function playedFraction(position: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(position)) return 0;
  return Math.max(0, Math.min(1, position / length));
}

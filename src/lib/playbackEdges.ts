export const TRIM_MIN_S = 0.05;
const HEAD_WINDOW_S = 0.6;

export function headTrimTarget(head: number, currentTime: number): number | null {
  if (!(head > TRIM_MIN_S) || currentTime >= Math.max(HEAD_WINDOW_S, head)) return null;
  return head;
}

export function tailReached(currentTime: number, duration: number, tail: number): boolean {
  return tail > TRIM_MIN_S && Number.isFinite(duration) && currentTime >= duration - tail - TRIM_MIN_S;
}

export const RING_RADIUS = 10;
export const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export function ringDashOffset(progress: number, length = RING_LENGTH): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return length * (1 - clamped);
}

export type DownloadVisual = "idle" | "busy" | "done";

export function downloadVisual(busy: boolean, done: boolean): DownloadVisual {
  if (busy) return "busy";
  return done ? "done" : "idle";
}

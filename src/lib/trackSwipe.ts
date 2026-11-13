import type { Track } from "../types";

export const AXIS_LOCK_PX = 10;
export const RUBBER_BAND = 0.3;

export type Axis = "x" | "y";
export type TrackChange = "next" | "prev";

export function swipeAxis(dx: number, dy: number, lockPx: number = AXIS_LOCK_PX): Axis | null {
  if (Math.hypot(dx, dy) < lockPx) return null;
  return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

export type TrackChangeInput = {
  offset: number;
  velocity: number;
  distance: number;
  speed: number;
  canPrev: boolean;
  canNext: boolean;
};

export function trackSwipeChange({ offset, velocity, distance, speed, canPrev, canNext }: TrackChangeInput): TrackChange | null {
  if (offset < 0 && canNext && (-offset > distance || -velocity > speed)) return "next";
  if (offset > 0 && canPrev && (offset > distance || velocity > speed)) return "prev";
  return null;
}

export function neighbourTracks(
  queue: readonly Track[],
  index: number,
): { prev: Track | null; next: Track | null } {
  return {
    prev: index > 0 ? (queue[index - 1] ?? null) : null,
    next: index + 1 < queue.length ? (queue[index + 1] ?? null) : null,
  };
}

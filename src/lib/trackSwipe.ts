import type { Track } from "../types";
import { landsPast } from "./gesturePhysics";

const AXIS_LOCK_PX = 10;
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
  canPrev: boolean;
  canNext: boolean;
};

export function trackSwipeChange({ offset, velocity, distance, canPrev, canNext }: TrackChangeInput): TrackChange | null {
  if (offset < 0 && canNext && landsPast(offset, velocity, distance)) return "next";
  if (offset > 0 && canPrev && landsPast(offset, velocity, distance)) return "prev";
  return null;
}

export function neighbourTracks(
  queue: readonly Track[],
  index: number,
  source: readonly Track[] = [],
): { prev: Track | null; next: Track | null } {
  const prev = index > 0 ? (queue[index - 1] ?? null) : null;
  const next = index + 1 < queue.length ? (queue[index + 1] ?? null) : null;
  const at = source.findIndex((track) => track.id === queue[index]?.id);
  if (at < 0) return { prev, next };
  return {
    prev: prev ?? (at > 0 ? (source[at - 1] ?? null) : null),
    next: next ?? (at + 1 < source.length ? (source[at + 1] ?? null) : null),
  };
}

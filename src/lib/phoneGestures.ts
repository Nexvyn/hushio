import { landsPast, rubberBand } from "./gesturePhysics";
import { RUBBER_BAND, type TrackChange } from "./trackSwipe";
import type { Point } from "./touchGesture";
import { viewportHeight } from "./viewport";

const FLICK_MIN_PX = 16;
export const RAIL_COMMIT_SHARE = 0.3;
export const ROW_COMMIT_PX = 80;
export const ROW_REVEAL_PX = 96;
const EDGE_INSET_PX = 24;
const EDGE_ZONE_PX = 20;
const EDGE_COMMIT_SHARE = 0.35;
const EDGE_SHADOW_ALPHA = 0.18;
export const PULL_TRIGGER_PX = 70;
export const PULL_HOLD_PX = 44;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 24;
export const LONG_HOLD_MS = 500;

export function swipeCommits(offset: number, velocity: number, threshold: number): boolean {
  return Math.abs(offset) >= FLICK_MIN_PX && landsPast(offset, velocity, threshold);
}

export type RailInput = {
  offset: number;
  velocity: number;
  threshold: number;
  canPrev: boolean;
  canNext: boolean;
};

export function railChange({ offset, velocity, threshold, canPrev, canNext }: RailInput): TrackChange | null {
  if (offset < 0 && canNext && swipeCommits(offset, velocity, threshold)) return "next";
  if (offset > 0 && canPrev && swipeCommits(offset, velocity, threshold)) return "prev";
  return null;
}

export function rowFollow(raw: number, reveal: number): number {
  const size = Math.abs(raw);
  const shown = Math.min(size, reveal) + Math.max(0, size - reveal) * RUBBER_BAND;
  return raw < 0 ? -shown : shown;
}

export function rowCommits(offset: number, velocity: number): boolean {
  return swipeCommits(offset, velocity, ROW_COMMIT_PX);
}

export function edgeStarts(startX: number): boolean {
  return startX >= EDGE_INSET_PX && startX <= EDGE_INSET_PX + EDGE_ZONE_PX;
}

export function edgeShadowAlpha(dx: number, width: number): number {
  const share = Math.min(1, Math.max(0, dx) / Math.max(1, width * 0.5));
  return share * EDGE_SHADOW_ALPHA;
}

export function edgeBackCommits(dx: number, velocity: number, width: number): boolean {
  return dx > 0 && swipeCommits(dx, velocity, width * EDGE_COMMIT_SHARE);
}

export function pullDistance(dy: number, dimension: number = viewportHeight()): number {
  return dy > 0 ? rubberBand(dy, dimension) : 0;
}

export function pullTriggers(distance: number): boolean {
  return distance >= PULL_TRIGGER_PX;
}

export type Tap = Point & { t: number };

export function isDoubleTap(previous: Tap | null, now: Tap, gapMs: number = DOUBLE_TAP_MS, slopPx: number = DOUBLE_TAP_SLOP_PX): boolean {
  if (previous === null) return false;
  if (now.t - previous.t > gapMs) return false;
  return Math.hypot(now.x - previous.x, now.y - previous.y) <= slopPx;
}

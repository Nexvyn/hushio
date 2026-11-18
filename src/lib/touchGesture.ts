const SWIPE_MIN_PX = 48;
export const PRESS_SLOP_PX = 10;
const SHEET_CLOSE_SHARE = 0.4;
const SHEET_FLING_PX_PER_S = 500;

export type SwipeDirection = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };

export function swipeOf(from: Point, to: Point, minPx: number = SWIPE_MIN_PX): SwipeDirection | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  if ((horizontal ? Math.abs(dx) : Math.abs(dy)) < minPx) return null;
  if (horizontal) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

export function pressMoved(from: Point, to: Point, slopPx: number = PRESS_SLOP_PX): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > slopPx;
}

export function sheetTravel(dragY: number): number {
  return Math.max(0, dragY);
}

export function sheetCloses(travel: number, height: number, downVelocityPxPerS: number): boolean {
  const far = height > 0 && travel / height > SHEET_CLOSE_SHARE;
  return far || downVelocityPxPerS > SHEET_FLING_PX_PER_S;
}

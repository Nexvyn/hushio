import { RUBBER_BAND_C, rubberBand } from "../../lib/gesturePhysics";
import { STRETCH_DISTANCE_PX, STRETCH_LOCK_PX, STRETCH_MAX_SCALE } from "../../lib/motion";
import { swipeAxis, type Axis } from "../../lib/trackSwipe";

export type StretchSide = "top" | "bottom";
export type StretchEdges = { top: boolean; bottom: boolean };

export const PULL_REFRESH_VIEWS: readonly string[] = ["home", "charts"];

export function topStretchFor(viewName: string): boolean {
  return !PULL_REFRESH_VIEWS.includes(viewName);
}

export function stretchScale(distance: number): number {
  if (distance <= 0) return 1;
  return 1 + (STRETCH_MAX_SCALE * rubberBand(distance, STRETCH_DISTANCE_PX)) / STRETCH_DISTANCE_PX;
}

export function stretchDistance(scale: number): number {
  const ratio = Math.min((scale - 1) / STRETCH_MAX_SCALE, 0.999999);
  if (ratio <= 0) return 0;
  return (STRETCH_DISTANCE_PX * (1 / (1 - ratio) - 1)) / RUBBER_BAND_C;
}

export function atTop(scrollTop: number): boolean {
  return scrollTop <= 0;
}

export function atBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollTop + clientHeight >= scrollHeight - 1;
}

export function stretchSideFor(
  step: number,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number },
  edges: StretchEdges,
): StretchSide | null {
  if (step > 0 && edges.top && atTop(metrics.scrollTop)) return "top";
  if (step < 0 && edges.bottom && atBottom(metrics.scrollTop, metrics.clientHeight, metrics.scrollHeight)) return "bottom";
  return null;
}

export function nextStretchDistance(distance: number, side: StretchSide, step: number): number {
  const toward = side === "top" ? step : -step;
  return Math.max(0, distance + toward);
}

export function stretchGestureAxis(dx: number, dy: number): Axis | null {
  return swipeAxis(dx, dy, STRETCH_LOCK_PX);
}

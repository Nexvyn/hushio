export const START_PX = 5;
export const TOUCH_HOLD_MS = 400;
export const TOUCH_SLOP_PX = 10;
const EDGE_PX = 48;
import { DURATION_MS } from "./motion";

export const SETTLE_MS = DURATION_MS.settle;
export const SETTLE_EASE = "var(--ease-settle)";
export const LIFT_SHADOW = "0 10px 28px rgba(0, 0, 0, 0.5)";

export type Box = { top: number; height: number };

export function slotFor(from: number, boxes: readonly Box[], offset: number): number {
  const centre = boxes[from].top + boxes[from].height / 2 + offset;
  let target = 0;
  boxes.forEach((box, index) => {
    if (index !== from && box.top + box.height / 2 < centre) target += 1;
  });
  return target;
}

export function clampOffset(offset: number, boxes: readonly Box[], from: number): number {
  const min = boxes[0].top - boxes[from].top;
  const max = boxes[boxes.length - 1].top - boxes[from].top;
  return Math.min(max, Math.max(min, offset));
}

export function spanAt(from: number, boxes: readonly Box[]): number {
  if (boxes.length < 2) return boxes[0]?.height ?? 0;
  if (from + 1 < boxes.length) return boxes[from + 1].top - boxes[from].top;
  return boxes[from].top - boxes[from - 1].top;
}

export function shiftFor(index: number, from: number, target: number, span: number): number {
  if (target > from && index > from && index <= target) return -span;
  if (target < from && index >= target && index < from) return span;
  return 0;
}

export function edgeOverflow(y: number, top: number, bottom: number): number {
  if (y < top + EDGE_PX) return y - top - EDGE_PX;
  if (y > bottom - EDGE_PX) return y - bottom + EDGE_PX;
  return 0;
}

export function autoScrollStep(over: number): number {
  if (over === 0) return 0;
  const size = Math.min(18, Math.max(1, Math.round(Math.abs(over) / 3)));
  return Math.sign(over) * size;
}

export function sortKeys(ids: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    return `${id}#${count}`;
  });
}

import { useRef, type PointerEvent } from "react";
import { type Point, type SwipeDirection, swipeOf } from "./touchGesture";

export function usePointerSwipe(onSwipe: (direction: SwipeDirection) => void, minPx?: number) {
  const start = useRef<Point | null>(null);
  return {
    onPointerDown(event: PointerEvent) {
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp(event: PointerEvent) {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const direction = swipeOf(from, { x: event.clientX, y: event.clientY }, minPx);
      if (direction) onSwipe(direction);
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}

export type PointerHandlers = {
  onPointerDown?: (event: PointerEvent) => void;
  onPointerMove?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onPointerCancel?: (event: PointerEvent) => void;
};

export function mergePointerHandlers(...sets: PointerHandlers[]): PointerHandlers {
  const names = ["onPointerDown", "onPointerMove", "onPointerUp", "onPointerCancel"] as const;
  const merged: PointerHandlers = {};
  for (const name of names) {
    const calls = sets.flatMap((set) => (set[name] ? [set[name]] : []));
    if (calls.length > 0) merged[name] = (event: PointerEvent) => calls.forEach((call) => call(event));
  }
  return merged;
}

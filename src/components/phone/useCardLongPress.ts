import { useEffect, useRef, type PointerEvent } from "react";
import { type MenuSource, resolveMenu } from "../ContextMenu";
import { haptic } from "../../lib/haptics";
import { LongPress } from "../../lib/longPress";
import { LONG_HOLD_MS } from "../../lib/phoneGestures";
import { PRESS_SLOP_PX, pressMoved, type Point } from "../../lib/touchGesture";
import { useUI } from "../../stores/ui";

export function menuAt(menu: MenuSource | undefined): ((point: Point) => void) | undefined {
  if (!menu) return undefined;
  return (point) => useUI.getState().openContextMenu(point.x, point.y, resolveMenu(menu));
}

export function useCardLongPress(onLongPress?: (point: Point) => void) {
  const origin = useRef<Point | null>(null);
  const fired = useRef(false);
  const handler = useRef(onLongPress);
  handler.current = onLongPress;

  const press = useRef<LongPress | null>(null);
  if (press.current === null) {
    press.current = new LongPress(() => {
      const at = origin.current;
      origin.current = null;
      if (!at || !handler.current) return;
      fired.current = true;
      haptic("select");
      handler.current(at);
    }, LONG_HOLD_MS);
  }

  useEffect(() => () => press.current?.cancel(), []);

  const release = () => {
    origin.current = null;
    press.current?.cancel();
  };

  const consumeHold = (): boolean => {
    const held = fired.current;
    fired.current = false;
    return held;
  };

  return {
    consumeHold,
    bind: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        fired.current = false;
        if (!handler.current) return;
        origin.current = { x: event.clientX, y: event.clientY };
        press.current?.start(origin.current);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const from = origin.current;
        if (!from) return;
        const to = { x: event.clientX, y: event.clientY };
        press.current?.move(to);
        if (pressMoved(from, to, PRESS_SLOP_PX)) release();
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
    },
  };
}

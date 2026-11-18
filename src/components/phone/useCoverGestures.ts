import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LongPress } from "../../lib/longPress";
import { haptic } from "../../lib/haptics";
import { isDoubleTap, LONG_HOLD_MS, type Tap } from "../../lib/phoneGestures";
import { PRESS_SLOP_PX, pressMoved, type Point } from "../../lib/touchGesture";
import { useLibrary, type LikeInput } from "../../stores/library";

export function useCoverGestures(track: LikeInput | null, onLongPress: (point: Point) => void) {
  const [burst, setBurst] = useState(0);
  const latest = useRef({ track, onLongPress });
  latest.current = { track, onLongPress };
  const origin = useRef<Point | null>(null);
  const moved = useRef(false);
  const fired = useRef(false);
  const lastTap = useRef<Tap | null>(null);
  const press = useRef<LongPress | null>(null);
  if (press.current === null) {
    press.current = new LongPress(() => {
      fired.current = true;
      lastTap.current = null;
      const at = origin.current;
      if (at) latest.current.onLongPress(at);
    }, LONG_HOLD_MS);
  }

  useEffect(() => () => press.current?.cancel(), []);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    fired.current = false;
    moved.current = false;
    origin.current = { x: event.clientX, y: event.clientY };
    press.current?.start(origin.current);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const from = origin.current;
    if (from && pressMoved(from, { x: event.clientX, y: event.clientY }, PRESS_SLOP_PX)) {
      moved.current = true;
      press.current?.cancel();
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const from = origin.current;
    origin.current = null;
    press.current?.cancel();
    if (!from || fired.current || moved.current) return;
    const now = { t: event.timeStamp, x: event.clientX, y: event.clientY };
    if (!isDoubleTap(lastTap.current, now)) {
      lastTap.current = now;
      return;
    }
    lastTap.current = null;
    const current = latest.current.track;
    if (current && !useLibrary.getState().liked.some((item) => item.id === current.id)) {
      useLibrary.getState().toggleLike(current);
    }
    haptic("select");
    setBurst((count) => count + 1);
  };

  const onPointerCancel = () => {
    origin.current = null;
    press.current?.cancel();
  };

  return { burst, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}

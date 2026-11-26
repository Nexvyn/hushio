import { useRef, type PointerEvent } from "react";
import { animate, useMotionValue } from "motion/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { haptic } from "../../lib/haptics";
import { phoneSnappy, reducedMotion } from "../../lib/motion";
import { ROW_REVEAL_PX, rowCommits, rowFollow } from "../../lib/phoneGestures";
import { swipeAxis, type Axis } from "../../lib/trackSwipe";
import { VelocityTracker } from "../../lib/velocity";

export type RowAction = {
  label: string;
  icon: PhosphorIcon;
  tone?: "neutral" | "danger";
  run: () => void;
};

type Session = { x0: number; y0: number; axis: Axis | null; tracker: VelocityTracker };

export function useSwipeRow(swipeLeft: RowAction | undefined, swipeRight: RowAction | undefined, enabled: boolean) {
  const x = useMotionValue(0);
  const session = useRef<Session | null>(null);
  const actions = useRef({ swipeLeft, swipeRight });
  actions.current = { swipeLeft, swipeRight };

  const reveal = (dx: number) => ((dx < 0 ? actions.current.swipeLeft : actions.current.swipeRight) ? ROW_REVEAL_PX : 0);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || event.button !== 0) return;
    const tracker = new VelocityTracker();
    tracker.reset(event.timeStamp, event.clientX);
    session.current = { x0: event.clientX, y0: event.clientY, axis: null, tracker };
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const active = session.current;
    if (!active) return;
    active.tracker.add(event.timeStamp, event.clientX);
    if (active.axis === null) active.axis = swipeAxis(event.clientX - active.x0, event.clientY - active.y0);
    if (active.axis !== "x") return;
    const dx = event.clientX - active.x0;
    x.set(rowFollow(dx, reveal(dx)));
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const active = session.current;
    session.current = null;
    if (!active || active.axis !== "x") return;
    const dx = x.get();
    active.tracker.add(event.timeStamp, event.clientX);
    const velocity = active.tracker.velocity(event.timeStamp);
    const action = dx < 0 ? actions.current.swipeLeft : actions.current.swipeRight;
    if (!cancelled && action && rowCommits(dx, velocity)) {
      haptic("select");
      action.run();
    }
    if (reducedMotion()) x.set(0);
    else animate(x, 0, { ...phoneSnappy, velocity });
  };

  return {
    x,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLElement>) => onPointerUp(event, false),
      onPointerCancel: (event: PointerEvent<HTMLElement>) => onPointerUp(event, true),
    },
  };
}

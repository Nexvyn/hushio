import { useEffect, useRef } from "react";
import { animate, useMotionValue, useTransform } from "motion/react";
import { haptic } from "../../lib/haptics";
import { SPRING_GESTURE, phoneSnappy, reducedMotion } from "../../lib/motion";
import { edgeBackCommits, edgeShadowAlpha, edgeStarts } from "../../lib/phoneGestures";
import { swipeAxis, type Axis } from "../../lib/trackSwipe";
import { viewportWidth } from "../../lib/viewport";
import { VelocityTracker } from "../../lib/velocity";

const IGNORE = "[data-swipe-row],[data-hscroll],input,textarea,[contenteditable],[data-no-edge-back]";
const MAX_SHADE = 0.08;

type Session = { x0: number; y0: number; axis: Axis | null; tracker: VelocityTracker };

export function useEdgeBack({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  const x = useMotionValue(0);
  const shade = useTransform(x, (value) => Math.min(MAX_SHADE, (Math.max(0, value) / Math.max(1, viewportWidth())) * MAX_SHADE * 2));
  const shadow = useTransform(x, (value) => edgeShadowAlpha(value, viewportWidth()));
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;
    let session: Session | null = null;

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !edgeStarts(event.clientX)) return;
      if ((event.target as Element | null)?.closest?.(IGNORE)) return;
      const tracker = new VelocityTracker();
      tracker.reset(event.timeStamp, event.clientX);
      session = { x0: event.clientX, y0: event.clientY, axis: null, tracker };
    };

    const onMove = (event: PointerEvent) => {
      const active = session;
      if (!active) return;
      active.tracker.add(event.timeStamp, event.clientX);
      if (active.axis === null) active.axis = swipeAxis(event.clientX - active.x0, event.clientY - active.y0);
      if (active.axis !== "x") return;
      x.set(Math.max(0, event.clientX - active.x0));
    };

    const finish = (event: PointerEvent, cancelled: boolean) => {
      const active = session;
      session = null;
      if (!active || active.axis !== "x") return;
      const dx = x.get();
      active.tracker.add(event.timeStamp, event.clientX);
      const velocity = active.tracker.velocity(event.timeStamp);
      const width = viewportWidth();
      if (!cancelled && edgeBackCommits(dx, velocity, width)) {
        haptic("select");
        if (reducedMotion()) {
          x.set(0);
          backRef.current();
          return;
        }
        animate(x, width, { ...SPRING_GESTURE, velocity }).then(() => {
          x.set(0);
          backRef.current();
        });
        return;
      }
      if (reducedMotion()) x.set(0);
      else animate(x, 0, { ...phoneSnappy, velocity });
    };

    const onUp = (event: PointerEvent) => finish(event, false);
    const onCancel = (event: PointerEvent) => finish(event, true);
    const onTouchMove = (event: TouchEvent) => {
      if (session && session.axis !== "y" && event.cancelable) event.preventDefault();
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", onTouchMove);
      x.set(0);
    };
  }, [enabled, x]);

  return { x, shade, shadow };
}

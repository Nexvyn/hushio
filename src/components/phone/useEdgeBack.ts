import { useEffect, useRef } from "react";
import { animate, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { listenBackGesture, platform } from "../../lib/bridge";
import { haptic } from "../../lib/haptics";
import { SPRING_GESTURE, phoneSnappy, reducedMotion } from "../../lib/motion";
import { edgeBackCommits, edgeShadowAlpha, edgeStarts } from "../../lib/phoneGestures";
import { swipeAxis, type Axis } from "../../lib/trackSwipe";
import { viewportWidth } from "../../lib/viewport";
import { VelocityTracker } from "../../lib/velocity";

const IGNORE = "[data-swipe-row],[data-hscroll],input,textarea,[contenteditable],[data-no-edge-back]";
const MAX_SHADE = 0.08;
const PEEK_PX = 28;
const SCALE_DROP = 0.08;
const RADIUS_PX = 24;
const BACK_SHADOW = 0.35;

type Session = { x0: number; y0: number; axis: Axis | null; tracker: VelocityTracker };

export function useEdgeBack({ enabled, onBack }: { enabled: boolean; onBack: () => void }) {
  const x = useMotionValue(0);
  const back = useMotionValue(0);
  const side = useMotionValue(1);
  const offset = useTransform([x, back, side], ([dx, p, s]: number[]) => dx + s * PEEK_PX * p);
  const shade = useTransform([x, back], ([dx, p]: number[]) =>
    Math.max(Math.min(MAX_SHADE, (Math.max(0, dx) / Math.max(1, viewportWidth())) * MAX_SHADE * 2), p * MAX_SHADE),
  );
  const shadow = useTransform([x, back], ([dx, p]: number[]) => Math.max(edgeShadowAlpha(dx, viewportWidth()), p * BACK_SHADOW));
  const scale = useTransform(back, (p) => 1 - SCALE_DROP * p);
  const radius = useTransform(back, (p) => RADIUS_PX * p);
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    if (!enabled || platform !== "android") return;
    let settle: AnimationPlaybackControls | null = null;
    let stop: (() => void) | null = null;
    let disposed = false;
    const halt = () => {
      settle?.stop();
      settle = null;
    };

    listenBackGesture({
      onProgress: (progress, swipeEdge) => {
        halt();
        side.set(swipeEdge === "right" ? -1 : 1);
        if (!reducedMotion()) back.set(Math.min(1, Math.max(0, progress)));
      },
      onCancel: () => {
        halt();
        if (reducedMotion()) back.set(0);
        else settle = animate(back, 0, phoneSnappy);
      },
      onCommit: () => {
        halt();
        if (reducedMotion()) return;
        const controls = animate(back, 1, SPRING_GESTURE);
        settle = controls;
        controls.then(() => {
          if (settle !== controls) return;
          settle = null;
          back.set(0);
        });
      },
    })
      .then((off) => {
        if (disposed) off();
        else stop = off;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      halt();
      stop?.();
      back.set(0);
    };
  }, [enabled, back, side]);

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

  return { x: offset, shade, shadow, scale, radius };
}

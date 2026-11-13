import { useEffect, useRef, type PointerEvent } from "react";
import { animate, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { type PointerHandlers } from "../../lib/usePointerSwipe";
import { phoneSmooth, reducedMotion } from "../../lib/motion";
import { swipeAxis, RUBBER_BAND, type Axis } from "../../lib/trackSwipe";

export const SHEET_CLOSE_SHARE_OF_SCREEN = 0.28;
export const SHEET_CLOSE_DOWN_VELOCITY = 600;
const VELOCITY_STALE_MS = 100;

export function dragOffset(raw: number): number {
  return raw < 0 ? raw * RUBBER_BAND : raw;
}

export function sheetReleaseCloses(distancePx: number, screenHeightPx: number, downVelocityPxPerS: number): boolean {
  return distancePx > screenHeightPx * SHEET_CLOSE_SHARE_OF_SCREEN || downVelocityPxPerS > SHEET_CLOSE_DOWN_VELOCITY;
}

function screenHeight(): number {
  return typeof window === "undefined" ? 0 : window.innerHeight;
}

type Session = {
  startX: number;
  startY: number;
  base: number;
  lastY: number;
  lastT: number;
  velocity: number;
  axis: Axis | null;
};

export function useSheetDrag(
  onClose: () => void,
  canStart: (event: PointerEvent) => boolean,
) {
  const reduced = reducedMotion();
  const y = useMotionValue(reduced ? 0 : screenHeight());
  const session = useRef<Session | null>(null);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const token = useRef(0);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(
    () => () => {
      token.current += 1;
      controls.current?.stop();
    },
    [],
  );

  const settle = (velocity: number) => {
    token.current += 1;
    if (reducedMotion()) {
      y.set(0);
      return;
    }
    controls.current = animate(y, 0, { ...phoneSmooth, velocity });
  };

  const dismiss = (velocity: number) => {
    if (reducedMotion()) {
      close.current();
      return;
    }
    const id = ++token.current;
    controls.current = animate(y, screenHeight(), { ...phoneSmooth, velocity });
    controls.current.finished.then(() => {
      if (token.current === id) close.current();
    });
  };

  const handlers: PointerHandlers = {
    onPointerDown(event: PointerEvent) {
      if (!canStart(event)) return;
      controls.current?.stop();
      token.current += 1;
      session.current = {
        startX: event.clientX,
        startY: event.clientY,
        base: y.get(),
        lastY: event.clientY,
        lastT: event.timeStamp,
        velocity: 0,
        axis: null,
      };
    },
    onPointerMove(event: PointerEvent) {
      const current = session.current;
      if (!current) return;
      const elapsed = event.timeStamp - current.lastT;
      if (elapsed > 0) current.velocity = ((event.clientY - current.lastY) / elapsed) * 1000;
      current.lastY = event.clientY;
      current.lastT = event.timeStamp;
      if (current.axis === null) {
        current.axis = swipeAxis(event.clientX - current.startX, event.clientY - current.startY);
        if (current.axis === null) return;
      }
      if (current.axis !== "y") return;
      y.set(dragOffset(current.base + event.clientY - current.startY));
    },
    onPointerUp(event: PointerEvent) {
      const current = session.current;
      session.current = null;
      if (!current || current.axis !== "y") return;
      const velocity = event.timeStamp - current.lastT > VELOCITY_STALE_MS ? 0 : current.velocity;
      if (sheetReleaseCloses(Math.max(0, y.get()), screenHeight(), velocity)) dismiss(velocity);
      else settle(velocity);
    },
    onPointerCancel() {
      const current = session.current;
      session.current = null;
      if (current?.axis === "y") settle(0);
    },
  };

  return { handlers, y };
}

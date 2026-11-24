import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { animate, useMotionValue, type AnimationPlaybackControls, type MotionValue } from "motion/react";
import { type PointerHandlers } from "../../lib/usePointerSwipe";
import { projectDistance, rubberBandEdge } from "../../lib/gesturePhysics";
import { swipeAxis, type Axis } from "../../lib/trackSwipe";
import { reducedMotion, SPRING_SHEET } from "../../lib/motion";
import { viewportHeight } from "../../lib/viewport";
import { VelocityTracker } from "../../lib/velocity";

const SHEET_CLOSE_SHARE_OF_SCREEN = 0.28;

export type SheetDriver = {
  y: MotionValue<number>;
  height: () => number;
  glide: (target: number, velocity: number, onDone?: () => void) => void;
  hold: () => void;
};

export function dragOffset(raw: number, dimension: number = viewportHeight()): number {
  return rubberBandEdge(raw, dimension);
}

export function sheetReleaseCloses(distancePx: number, screenHeightPx: number, downVelocityPxPerS: number): boolean {
  return distancePx + projectDistance(downVelocityPxPerS) > screenHeightPx * SHEET_CLOSE_SHARE_OF_SCREEN;
}

function useLocalDriver(travel?: () => number): SheetDriver {
  const y = useMotionValue(reducedMotion() ? 0 : viewportHeight());
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const token = useRef(0);

  useEffect(
    () => () => {
      token.current += 1;
      controls.current?.stop();
    },
    [],
  );

  return useMemo<SheetDriver>(
    () => ({
      y,
      height: travel ?? viewportHeight,
      hold() {
        token.current += 1;
        controls.current?.stop();
      },
      glide(target, velocity, onDone) {
        token.current += 1;
        const id = token.current;
        if (reducedMotion()) {
          y.set(target);
          onDone?.();
          return;
        }
        controls.current = animate(y, target, { ...SPRING_SHEET, velocity });
        controls.current.finished.then(
          () => {
            if (token.current === id) onDone?.();
          },
          () => {},
        );
      },
    }),
    [y],
  );
}

export type DragStart = "grab" | "content";

type Session = {
  mode: DragStart;
  engaged: boolean;
  startX: number;
  startY: number;
  base: number;
  axis: Axis | null;
  tracker: VelocityTracker;
};

export function sheetBodyAtTop(target: Element, root: Element): boolean {
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight && node.scrollTop > 0) return false;
  }
  return root.scrollTop <= 0;
}

export function useSheetDrag(
  onClose: () => void,
  canStart: (event: PointerEvent) => DragStart | null,
  external?: SheetDriver,
  travel?: () => number,
) {
  const local = useLocalDriver(travel);
  const driver = external ?? local;
  const session = useRef<Session | null>(null);
  const goal = useRef<"open" | "closed">("open");
  const close = useRef(onClose);
  close.current = onClose;

  const settle = (velocity: number) => {
    goal.current = "open";
    driver.glide(0, velocity);
  };

  const dismiss = (velocity: number) => {
    goal.current = "closed";
    driver.glide(driver.height(), velocity, () => close.current());
  };

  const resume = () => {
    if (goal.current === "closed") dismiss(0);
    else settle(0);
  };

  const handlers: PointerHandlers = {
    onPointerDown(event: PointerEvent) {
      const mode = canStart(event);
      if (!mode) return;
      if (mode === "grab") driver.hold();
      const tracker = new VelocityTracker();
      tracker.reset(event.timeStamp, event.clientY);
      session.current = {
        mode,
        engaged: mode === "grab",
        startX: event.clientX,
        startY: event.clientY,
        base: driver.y.get(),
        axis: null,
        tracker,
      };
    },
    onPointerMove(event: PointerEvent) {
      const current = session.current;
      if (!current) return;
      current.tracker.add(event.timeStamp, event.clientY);
      if (current.axis === null) {
        current.axis = swipeAxis(event.clientX - current.startX, event.clientY - current.startY);
        if (current.axis === null) return;
      }
      if (current.axis !== "y") return;
      if (!current.engaged) {
        if (event.clientY - current.startY <= 0) return;
        current.engaged = true;
        driver.hold();
        current.base = driver.y.get();
      }
      driver.y.set(dragOffset(current.base + event.clientY - current.startY));
    },
    onPointerUp(event: PointerEvent) {
      const current = session.current;
      session.current = null;
      if (!current) return;
      if (current.axis !== "y" || !current.engaged) {
        if (current.mode === "grab") resume();
        return;
      }
      current.tracker.add(event.timeStamp, event.clientY);
      const velocity = current.tracker.velocity(event.timeStamp);
      if (sheetReleaseCloses(Math.max(0, driver.y.get()), driver.height(), velocity)) dismiss(velocity);
      else settle(velocity);
    },
    onPointerCancel() {
      const current = session.current;
      session.current = null;
      if (current?.engaged && current.axis === "y") settle(0);
      else if (current?.mode !== "content") resume();
    },
  };

  return { handlers, close: () => dismiss(0), y: driver.y };
}

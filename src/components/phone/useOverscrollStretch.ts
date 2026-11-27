import { useEffect, useRef } from "react";
import { animate, useMotionValue } from "motion/react";
import { SPRING_GESTURE, reducedMotion } from "../../lib/motion";
import { useSheetOpen } from "./phoneOverlays";
import {
  nextStretchDistance,
  stretchDistance,
  stretchGestureAxis,
  stretchScale,
  stretchSideFor,
  type StretchEdges,
  type StretchSide,
} from "./overscrollStretch";

type Mode = "pending" | "vertical" | "skip";

type Controls = { stop: () => void } | null | undefined;

export function useOverscrollStretch(scrollerId: string, edges: StretchEdges): void {
  const scale = useMotionValue(1);
  const sheetOpen = useSheetOpen();
  const live = useRef({ edges, sheetOpen });
  live.current.edges = edges;
  live.current.sheetOpen = sheetOpen;

  useEffect(() => {
    const scroller = document.getElementById(scrollerId);
    if (!scroller) return;

    let target: HTMLElement | null = null;
    let controls: Controls = null;
    let mode: Mode = "pending";
    let side: StretchSide | null = null;
    let origin: StretchSide = "top";
    let distance = 0;
    let startX = 0;
    let startY = 0;
    let lastY = 0;

    const paint = (value: number) => {
      if (!target) return;
      target.style.transform = value === 1 ? "" : `scaleY(${value})`;
    };
    const unpaint = scale.on("change", paint);

    const stop = () => {
      controls?.stop();
      controls = null;
    };

    const release = () => {
      stop();
      if (reducedMotion()) scale.set(1);
      else controls = animate(scale, 1, SPRING_GESTURE);
    };

    const eligible = (event: TouchEvent): boolean => {
      if (event.touches.length !== 1 || reducedMotion() || live.current.sheetOpen) return false;
      if (!live.current.edges.top && !live.current.edges.bottom) return false;
      const element = event.target instanceof Element ? event.target : null;
      const marked = element?.closest("[data-no-stretch]");
      if (marked && scroller.contains(marked)) return false;
      return scroller.firstElementChild instanceof HTMLElement;
    };

    const onStart = (event: TouchEvent) => {
      const grabbed = scale.get() !== 1;
      if (grabbed) {
        stop();
        distance = stretchDistance(scale.get());
        side = origin;
      } else {
        distance = 0;
        side = null;
      }
      mode = "pending";
      const touch = event.touches[0];
      startX = touch?.clientX ?? 0;
      startY = touch?.clientY ?? 0;
      lastY = startY;
      if (!eligible(event)) {
        mode = "skip";
        if (grabbed) {
          side = null;
          distance = 0;
          release();
        }
        return;
      }
      target = scroller.firstElementChild as HTMLElement;
    };

    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const step = y - lastY;
      lastY = y;
      if (mode === "skip") return;
      if (mode === "pending") {
        const axis = stretchGestureAxis(event.touches[0].clientX - startX, y - startY);
        if (axis === null) return;
        if (axis === "x") {
          mode = "skip";
          if (side !== null) {
            side = null;
            distance = 0;
            release();
          }
          return;
        }
        mode = "vertical";
      }
      if (side === null) {
        const next = stretchSideFor(step, { scrollTop: scroller.scrollTop, clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight }, live.current.edges);
        if (next === null || !target) return;
        side = next;
        origin = next;
        target.style.transformOrigin = next;
      }
      if (event.cancelable) event.preventDefault();
      distance = nextStretchDistance(distance, side, step);
      if (distance === 0) side = null;
      scale.set(stretchScale(distance));
    };

    const onEnd = () => {
      const wasStretching = side !== null || scale.get() !== 1;
      mode = "pending";
      side = null;
      distance = 0;
      if (wasStretching) release();
    };

    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd, { passive: true });
    scroller.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
      unpaint();
      stop();
      scale.set(1);
      if (target) target.style.transform = "";
    };
  }, [scrollerId, scale]);
}

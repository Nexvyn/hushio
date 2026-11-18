import { useEffect, useRef, useState } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import { haptic } from "../../lib/haptics";
import { phoneSmooth, reducedMotion } from "../../lib/motion";
import { PULL_HOLD_PX, pullDistance, pullTriggers } from "../../lib/phoneGestures";
import { pullClaim } from "../../lib/gestureClaim";
import { VelocityTracker } from "../../lib/velocity";

const SCROLLER_ID = "view-scroll";
const FALLBACK_MS = 4000;

function settleTo(distance: MotionValue<number>, target: number, velocity = 0): void {
  if (reducedMotion()) distance.set(target);
  else animate(distance, target, { ...phoneSmooth, velocity });
}

export function usePullToRefresh({ enabled, busy, onRefresh }: { enabled: boolean; busy: boolean; onRefresh: () => void }) {
  const distance = useMotionValue(0);
  const [refreshing, setRefreshing] = useState(false);
  const live = useRef({ busy, onRefresh, refreshing: false, seenBusy: false, timer: 0 });
  live.current.busy = busy;
  live.current.onRefresh = onRefresh;

  const finish = () => {
    const state = live.current;
    if (!state.refreshing) return;
    state.refreshing = false;
    state.seenBusy = false;
    window.clearTimeout(state.timer);
    setRefreshing(false);
    settleTo(distance, 0);
  };

  useEffect(() => {
    const state = live.current;
    if (!state.refreshing) return;
    if (busy) state.seenBusy = true;
    else if (state.seenBusy) finish();
  }, [busy]);

  useEffect(() => {
    if (!enabled) return;
    const scroller = document.getElementById(SCROLLER_ID);
    if (!scroller) return;
    let startX = 0;
    let startY: number | null = null;
    let pulling = false;
    let armed = false;
    const tracker = new VelocityTracker();

    const onStart = (event: TouchEvent) => {
      if (live.current.refreshing || event.touches.length !== 1 || scroller.scrollTop > 0) {
        startY = null;
        return;
      }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracker.reset(event.timeStamp, 0);
      pulling = false;
      armed = false;
    };

    const onMove = (event: TouchEvent) => {
      if (startY === null) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!pulling) {
        const claim = pullClaim(dx, dy, scroller.scrollTop);
        if (claim === "pending") return;
        if (claim === "release") {
          startY = null;
          return;
        }
        pulling = true;
      }
      if (dy <= 0) {
        distance.set(0);
        armed = false;
        return;
      }
      if (event.cancelable) event.preventDefault();
      const shown = pullDistance(dy);
      distance.set(shown);
      tracker.add(event.timeStamp, shown);
      const isArmed = pullTriggers(shown);
      if (isArmed !== armed) {
        armed = isArmed;
        haptic("tick");
      }
    };

    const onEnd = (event: TouchEvent) => {
      if (startY === null) return;
      const wasPulling = pulling;
      startY = null;
      pulling = false;
      armed = false;
      if (!wasPulling) return;
      const state = live.current;
      if (!pullTriggers(distance.get())) {
        settleTo(distance, 0, tracker.velocity(event.timeStamp));
        return;
      }
      haptic("select");
      state.refreshing = true;
      state.seenBusy = false;
      setRefreshing(true);
      settleTo(distance, PULL_HOLD_PX);
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(finish, FALLBACK_MS);
      state.onRefresh();
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
    };
  }, [enabled, distance]);

  return { distance, refreshing };
}

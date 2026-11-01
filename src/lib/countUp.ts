import { useEffect, useState } from "react";
import { reducedMotion } from "./motion";

export const COUNT_UP_MS = 1100;

export function easeOutQuartic(progress: number): number {
  return 1 - Math.pow(1 - progress, 4);
}

export function countUpValue(target: number, elapsed: number, duration = COUNT_UP_MS): number {
  const progress = Math.min(1, Math.max(0, elapsed / duration));
  return Math.round(target * easeOutQuartic(progress));
}

export function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));

  useEffect(() => {
    if (reducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= COUNT_UP_MS) {
        setValue(target);
        return;
      }
      setValue(countUpValue(target, elapsed));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

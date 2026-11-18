import { useCallback, useEffect, useState, type AnimationEvent } from "react";
import { reducedMotion } from "../../lib/motion";

export const FIRST_LOAD_STAGGER_FALLBACK_MS = 1000;
export const FIRST_LOAD_STAGGER_MAX_CHILDREN = 5;
const STAGGER_CLASS = "bt-stagger";
const RISE_ANIMATION = "bt-rise-soft";

export function useFirstLoadStagger(ready: boolean) {
  const [done, setDone] = useState(() => reducedMotion());
  const active = ready && !done;

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setDone(true), FIRST_LOAD_STAGGER_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.animationName !== RISE_ANIMATION) return;
    const children = event.currentTarget.children;
    const last = children[Math.min(children.length, FIRST_LOAD_STAGGER_MAX_CHILDREN) - 1];
    if (event.target === last) setDone(true);
  }, []);

  return { className: active ? STAGGER_CLASS : "", onAnimationEnd };
}

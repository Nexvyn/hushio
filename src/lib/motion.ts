import { animate, type Transition } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0, 0, 0.58, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.42, 0, 0.58, 1];

export const glide: Transition = { type: "spring", stiffness: 341.5, damping: 30.3, mass: 1 };
export const settle: Transition = { type: "spring", stiffness: 438.7, damping: 36.0, mass: 1 };
export const foldOut: Transition = { type: "spring", stiffness: 2014.2, damping: 77.2, mass: 1 };
export const foldIn: Transition = { type: "spring", stiffness: 2336.0, damping: 96.7, mass: 1 };

export const pipCritical: Transition = { type: "spring", stiffness: 225, damping: 30, mass: 1 };
export const pipBounce: Transition = { type: "spring", stiffness: 256, damping: 16, mass: 1 };

export const quick: Transition = { duration: 0.14, ease: EASE_OUT };
export const fade: Transition = { duration: 0.12, ease: EASE_OUT };
export const swap: Transition = { duration: 0.22, ease: EASE_OUT };
export const readingFill: Transition = { duration: 0.15, ease: EASE_OUT };
export const instant: Transition = { duration: 0 };

export const give = { scale: 0.97 } as const;

export const breath = {
  animate: { scale: [0.97, 1.03], opacity: [0.65, 1] },
  transition: { duration: 2.6, ease: EASE_IN_OUT, repeat: Infinity, repeatType: "reverse" as const },
};

export const pulse = {
  animate: { scale: [1, 1.35, 1] },
  transition: {
    duration: 0.3,
    times: [0, 0.4, 1],
    ease: [EASE_IN_OUT, EASE_OUT],
  },
};

export const sheen: Transition = { duration: 1.3, ease: EASE_IN_OUT, repeat: Infinity };
export const skeletonDelay = 0.15;
export const skeletonFade: Transition = { duration: 0.2, ease: EASE_OUT, delay: 0.15 };

export const spin: Transition = { duration: 0.85, ease: "linear", repeat: Infinity };

export const shakeOffset = (travel: number) => 7 * Math.sin(travel * Math.PI * 6) * (1 - travel);
export function runShake(set: (px: number) => void) {
  return animate(0, 1, {
    duration: 0.5,
    ease: EASE_OUT,
    onUpdate: (t) => set(shakeOffset(t)),
  });
}

export function gate<T extends Transition>(reduced: boolean, t: T): Transition {
  return reduced ? instant : t;
}

export function reducedMotion(): boolean {
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

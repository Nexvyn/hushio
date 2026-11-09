import type { Transition } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0, 0, 0.58, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.42, 0, 0.58, 1];

export const DURATION_MS = {
  quick: 140,
  fade: 120,
  picker: 180,
  pickerOut: 120,
  swap: 220,
  reading: 150,
  settle: 500,
  shake: 500,
  eq: 420,
  sheen: 1300,
  spin: 850,
  intro: 160,
  pageIn: 240,
  pageOut: 120,
} as const;

export type DurationName = keyof typeof DURATION_MS;

export const LOOPING_DURATIONS: readonly DurationName[] = ["eq", "sheen", "spin"];

export const MOTION_MAX_MS = 500;

export const INTRO_HOLD_MS = 800;
export const INTRO_READY_CAP_MS = 6000;
export const INTRO_POLL_MS = 50;

export function motionVars(reduced: boolean): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const name of Object.keys(DURATION_MS) as DurationName[]) {
    vars[`--dur-${name}`] = `${reduced ? 0 : DURATION_MS[name]}ms`;
  }
  return vars;
}

export const glide: Transition = { type: "spring", stiffness: 341.5, damping: 30.3, mass: 1 };
export const settle: Transition = { type: "spring", stiffness: 438.7, damping: 36.0, mass: 1 };

export const quick: Transition = { duration: DURATION_MS.quick / 1000, ease: EASE_OUT };
export const fade: Transition = { duration: DURATION_MS.fade / 1000, ease: EASE_OUT };
export const swap: Transition = { duration: DURATION_MS.swap / 1000, ease: EASE_OUT };
export const instant: Transition = { duration: 0 };
export const pickerIn: Transition = { duration: DURATION_MS.picker / 1000, ease: EASE_OUT };
export const pickerOut: Transition = { duration: DURATION_MS.pickerOut / 1000, ease: EASE_OUT };
export const introFade: Transition = { duration: DURATION_MS.intro / 1000, ease: EASE_OUT };

export function gate<T extends Transition>(reduced: boolean, t: T): Transition {
  return reduced ? instant : t;
}

export function reducedMotion(): boolean {
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

export function restartClass(node: HTMLElement | null, className: string): void {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

export const INTRO_TIMING = {
  popDelay: 0.12,
  popDuration: 0.72,
  groundDelay: 0.84,
  groundDuration: 0.16,
  settleDelay: 2.05,
  settleDuration: 0.65,
  slideStart: 152.75,
  slideMid: 76.375,
  letterStart: 2.35,
  letterStep: 0.05,
  letterDuration: 0.6,
  breathDelay: 3.3,
  breathDuration: 1.8,
  oneShotCapMs: 4000,
  flightDuration: 0.7,
  wordGap: 14,
  wordWidth: 268.5,
} as const;

export const INTRO_POP_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const INTRO_LETTER_EASE: [number, number, number, number] = [0.33, 1, 0.68, 1];
export const INTRO_SETTLE_EASES: [[number, number, number, number], [number, number, number, number]] = [
  [0.32, 0, 0.67, 0],
  [0.33, 1, 0.68, 1],
];
export const INTRO_FLIGHT_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

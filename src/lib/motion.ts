import type { Transition } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_IN: [number, number, number, number] = [0.4, 0, 1, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.42, 0, 0.58, 1];

export const DURATION_MS = {
  instant: 100,
  quick: 175,
  fade: 120,
  picker: 175,
  pickerOut: 120,
  swap: 200,
  reading: 150,
  settle: 400,
  eq: 420,
  sheen: 500,
  spin: 850,
  intro: 160,
  press: 120,
  pageIn: 275,
  reveal: 280,
  hover: 200,
  nowPlayingExit: 210,
  roll: 400,
  rollOut: 280,
  dialogIn: 225,
  dialogOut: 160,
  canvasFade: 300,
  lyricFocus: 160,
  lyricFocusReduced: 120,
  lyricWordLift: 160,
  lyricScroll: 275,
  queue: 400,
  progress: 300,
  toastOut: 160,
  introAppend: 180,
} as const;

export type DurationName = keyof typeof DURATION_MS;

export const LOOPING_DURATIONS: readonly DurationName[] = ["eq", "sheen", "spin"];

export const MOTION_MAX_MS = 500;

export const SPRING_SHEET: Transition = { type: "spring", stiffness: 400, damping: 40, mass: 1 };
export const SPRING_GESTURE: Transition = { type: "spring", stiffness: 300, damping: 35, mass: 1 };
export const SPRING_CONTROL: Transition = { type: "spring", stiffness: 440, damping: 42, mass: 1 };
export const STRETCH_MAX_SCALE = 0.08;
export const STRETCH_DISTANCE_PX = 600;
export const STRETCH_LOCK_PX = 8;
export const MS_PRESS_OUT = 160;
export const MS_FADE = 120;
export const MS_IMAGE = 140;

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
export const canvasFade: Transition = { duration: DURATION_MS.canvasFade / 1000, ease: EASE_OUT };
export const swap: Transition = { duration: DURATION_MS.swap / 1000, ease: EASE_OUT };
export const instant: Transition = { duration: 0 };
export const pickerIn: Transition = { duration: DURATION_MS.picker / 1000, ease: EASE_OUT };
export const pickerOut: Transition = { duration: DURATION_MS.pickerOut / 1000, ease: EASE_IN };
export const introFade: Transition = { duration: DURATION_MS.intro / 1000, ease: EASE_OUT };
export const nowPlayingExit: Transition = { duration: DURATION_MS.nowPlayingExit / 1000, ease: EASE_IN };

export function gate<T extends Transition>(reduced: boolean, t: T): Transition {
  return reduced ? instant : t;
}

let mediaFn: typeof window.matchMedia | undefined;
let mediaList: MediaQueryList | null = null;

function systemReducesMotion(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  if (window.matchMedia !== mediaFn) {
    mediaFn = window.matchMedia;
    mediaList = window.matchMedia("(prefers-reduced-motion: reduce)") ?? null;
  }
  return mediaList?.matches ?? false;
}

export function reducedMotion(): boolean {
  return document.documentElement.classList.contains("reduce-motion") || systemReducesMotion();
}


export const phoneSnappy: Transition = SPRING_CONTROL;
export const phoneSmooth: Transition = { type: "spring", stiffness: 300, damping: 35, mass: 1 };
export const phoneShared: Transition = SPRING_GESTURE;
export const nowPlayingEnter = phoneShared;

export const PHONE_MS = {
  scrim: 160,
  tab: 150,
  navFade: 120,
  artOut: 120,
  press: 120,
  likeHold: 290,
  likeFade: 160,
  likeBeat: 120,
} as const;

export function phoneTween(ms: number): Transition {
  return { duration: ms / 1000, ease: EASE_OUT };
}

export function phoneTransition(reduced: boolean, spring: Transition): Transition {
  return reduced ? fade : spring;
}

export const toastStack: Transition = { type: "spring", stiffness: 320, damping: 36, mass: 1 };
export const toastOut: Transition = { duration: DURATION_MS.toastOut / 1000, ease: EASE_IN };
export const progressFill: Transition = { duration: DURATION_MS.progress / 1000, ease: EASE_OUT };

export const artPauseSpring: Transition = { type: "spring", stiffness: 300, damping: 33, mass: 1 };
export const scrubSpring: Transition = { type: "spring", stiffness: 400, damping: 36, mass: 1 };
export const coverSnapSpring: Transition = { type: "spring", stiffness: 400, damping: 40, mass: 1 };
export const QUEUE_EASE: [number, number, number, number] = EASE_IN_OUT;
export const pressIn: Transition = { duration: PHONE_MS.press / 1000, ease: EASE_OUT };

export const MARQUEE = { pxPerS: 26, gapPx: 48, restS: 5, artistDelayS: 3 } as const;

export const PRESS_SCALE = 0.97;

export function pressTap(reduced: boolean) {
  return reduced ? undefined : { scale: PRESS_SCALE, transition: pressIn };
}

import type { Transition } from "motion/react";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_MOVE: [number, number, number, number] = [0.4, 0, 0.2, 1];
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
  press: 50,
  pageIn: 240,
  reveal: 280,
  stagger: 40,
  hover: 200,
  nowPlayingExit: 210,
  roll: 380,
  gooOut: 160,
  gooFade: 120,
  gooDelay: 60,
  canvasFade: 500,
  lyric: 400,
  queue: 420,
  progress: 300,
  toastOut: 160,
  introItem: 220,
  introAppend: 180,
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
export const canvasFade: Transition = { duration: DURATION_MS.canvasFade / 1000, ease: EASE_OUT };
export const swap: Transition = { duration: DURATION_MS.swap / 1000, ease: EASE_OUT };
export const instant: Transition = { duration: 0 };
export const pickerIn: Transition = { duration: DURATION_MS.picker / 1000, ease: EASE_OUT };
export const pickerOut: Transition = { duration: DURATION_MS.pickerOut / 1000, ease: EASE_OUT };
export const introFade: Transition = { duration: DURATION_MS.intro / 1000, ease: EASE_OUT };
export const nowPlayingExit: Transition = { duration: DURATION_MS.nowPlayingExit / 1000, ease: EASE_OUT };

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

export const INTRO_POP_EASE = EASE_OUT;
export const INTRO_LETTER_EASE: [number, number, number, number] = [0.33, 1, 0.68, 1];
export const INTRO_SETTLE_EASES: [[number, number, number, number], [number, number, number, number]] = [
  [0.32, 0, 0.67, 0],
  [0.33, 1, 0.68, 1],
];
export const INTRO_FLIGHT_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

export const phoneSnappy: Transition = { type: "spring", stiffness: 420, damping: 36, mass: 1 };
export const phoneSmooth: Transition = { type: "spring", stiffness: 260, damping: 30, mass: 1 };
export const phoneBouncy: Transition = { type: "spring", stiffness: 380, damping: 29, mass: 1 };
export const SPRING_SHEET: Transition = { type: "spring", stiffness: 400, damping: 40, mass: 1 };
export const SPRING_GESTURE: Transition = { type: "spring", stiffness: 300, damping: 34, mass: 1 };
export const SPRING_CONTROL: Transition = { type: "spring", stiffness: 420, damping: 36, mass: 1 };
export const MS_PRESS_IN = 120;
export const MS_PRESS_OUT = 160;
export const MS_ICON = 140;
export const MS_FADE = 120;
export const MS_POPOVER_IN = 160;
export const MS_POPOVER_OUT = 120;
export const MS_IMAGE = 140;
export const phoneShared: Transition = SPRING_GESTURE;
export const nowPlayingEnter = phoneShared;

export const PHONE_MS = {
  scrim: 160,
  tab: 140,
  navFade: 160,
  artIn: 180,
  artOut: 120,
  text: 150,
  icon: 160,
  press: 50,
  likeHold: 290,
  likeFade: 160,
  likeBeat: 120,
  lyricsHint: 400,
} as const;

export function phoneTween(ms: number): Transition {
  return { duration: ms / 1000, ease: EASE_OUT };
}

export function phoneTransition(reduced: boolean, spring: Transition): Transition {
  return reduced ? fade : spring;
}

export const toastStack: Transition = { type: "spring", stiffness: 300, damping: 30, mass: 1 };
export const toastOut: Transition = { duration: DURATION_MS.toastOut / 1000, ease: EASE_OUT };
export const progressFill: Transition = { duration: DURATION_MS.progress / 1000, ease: EASE_OUT };

export const sheetSpring: Transition ={ type: "spring", stiffness: 195, damping: 27.93, mass: 1, restDelta: 0.5 };
export const nowPlayingSpring: Transition = SPRING_SHEET;
export const artPauseSpring: Transition = { type: "spring", stiffness: 300, damping: 33, mass: 1 };
export const scrubSpring: Transition = { type: "spring", stiffness: 400, damping: 36, mass: 1 };
export const coverSnapSpring: Transition = { type: "spring", stiffness: 400, damping: 40, mass: 1 };
export const QUEUE_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
export const LYRIC_EASE = "cubic-bezier(0.41, 0, 0.12, 0.99)";
export const pressIn: Transition = { duration: PHONE_MS.press / 1000, ease: EASE_OUT };

export const MARQUEE = { pxPerS: 26, gapPx: 48, restS: 5, artistDelayS: 3 } as const;

const PRESS_SCALE = 0.97;
const PRESS_DIM = 0.82;

export function pressTap(reduced: boolean) {
  return reduced ? undefined : { scale: PRESS_SCALE, opacity: PRESS_DIM, transition: pressIn };
}

import { DURATION_MS } from "./motion";

const HOME_INTRO_MAX_STAGGERED = 5;
export const HOME_INTRO_WINDOW_MS = 1200;

export type IntroSession = { claimed: boolean };
export type RevealMode = "intro" | "append" | "still";
export type HomeRevealPlan = { intro: boolean; painted: boolean; mountedAt: number };

const session: IntroSession = { claimed: false };

export function claimHomeIntro(state: IntroSession = session): boolean {
  if (state.claimed) return false;
  state.claimed = true;
  return true;
}

export function revealMode({
  intro,
  firstPaint,
  elapsedMs,
  reduced,
}: {
  intro: boolean;
  firstPaint: boolean;
  elapsedMs: number;
  reduced: boolean;
}): RevealMode {
  if (reduced) return "still";
  if (intro && elapsedMs <= HOME_INTRO_WINDOW_MS) return "intro";
  return firstPaint ? "still" : "append";
}

export function revealDelayMs(index: number): number {
  return Math.min(Math.max(0, index), HOME_INTRO_MAX_STAGGERED - 1) * DURATION_MS.stagger;
}


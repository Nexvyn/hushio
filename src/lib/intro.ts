import { DURATION_MS, INTRO_HOLD_MS, INTRO_POLL_MS, INTRO_READY_CAP_MS } from "./motion";
import type { Platform } from "./bridge";

export type IntroPlan = {
  glide: boolean;
  holdMs: number;
  readyCapMs: number;
  pollMs: number;
  fadeMs: number;
};

export function introPlan(input: { reduce: boolean; platform: Platform; hasTarget: boolean }): IntroPlan {
  return {
    glide: !input.reduce && input.platform !== "android" && input.hasTarget,
    holdMs: INTRO_HOLD_MS,
    readyCapMs: INTRO_READY_CAP_MS,
    pollMs: INTRO_POLL_MS,
    fadeMs: DURATION_MS.intro,
  };
}

let finishedThisLaunch = false;

export function introFinished(): boolean {
  return finishedThisLaunch;
}

export function markIntroFinished(): void {
  finishedThisLaunch = true;
}

export async function waitUntil(isReady: () => boolean, capMs: number, pollMs: number): Promise<boolean> {
  let waited = 0;
  while (!isReady()) {
    if (waited >= capMs) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    waited += pollMs;
  }
  return true;
}

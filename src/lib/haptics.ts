import { platform } from "./bridge";
import { useSettings } from "../stores/settings";

export type Haptic = "tick" | "select" | "success";

const PATTERNS: Record<Haptic, number | number[]> = {
  tick: 8,
  select: 12,
  success: [10, 40, 14],
};

const MIN_GAP_MS = 40;
let lastFired = Number.NEGATIVE_INFINITY;

export function haptic(kind: Haptic): void {
  try {
    if (platform !== "android") return;
    if (!useSettings.getState().haptics) return;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastFired < MIN_GAP_MS) return;
    lastFired = now;
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    return;
  }
}

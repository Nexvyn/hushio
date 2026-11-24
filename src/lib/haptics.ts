import { hapticTick, platform } from "./bridge";
import { useSettings } from "../stores/settings";

export type Haptic = "tick" | "select" | "success" | "warning";

const MIN_GAP_MS = 40;
let lastFired = Number.NEGATIVE_INFINITY;

export function haptic(kind: Haptic): void {
  try {
    if (platform !== "android") return;
    if (!useSettings.getState().haptics) return;
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastFired < MIN_GAP_MS) return;
    lastFired = now;
    void hapticTick(kind).catch(() => {});
  } catch {
    return;
  }
}

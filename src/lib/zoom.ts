import { getCurrentWebview } from "@tauri-apps/api/webview";

export const ZOOM_STEPS = [0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
export const ZOOM_DEFAULT = 1;
const EPSILON = 1e-6;

export function nextZoom(current: number, direction: 1 | -1 | 0): number {
  if (direction === 0) return ZOOM_DEFAULT;
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + EPSILON) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((step) => step < current - EPSILON) ?? ZOOM_STEPS[0];
}

export async function applyZoom(level: number): Promise<void> {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      await getCurrentWebview().setZoom(level);
      return;
    } catch (error) {
      console.warn(`[hushio] Webview zoom failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  document.documentElement.style.zoom = level === ZOOM_DEFAULT ? "" : String(level);
}

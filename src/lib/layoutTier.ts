import { useSyncExternalStore } from "react";

export const TABLET_MIN_DP = 840;
export const WIDE_MIN_DP = 1200;

export type ShellMode = "phone" | "tablet";
export type RailMode = "column" | "sheet" | "hidden";

export function shellFor(widthDp: number): ShellMode {
  return widthDp >= TABLET_MIN_DP ? "tablet" : "phone";
}

export function railFor(widthDp: number): RailMode {
  if (widthDp >= WIDE_MIN_DP) return "column";
  if (widthDp >= TABLET_MIN_DP) return "sheet";
  return "hidden";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readWidth(): number {
  return window.innerWidth;
}

export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, readWidth, () => 0);
}

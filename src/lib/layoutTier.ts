import { useSyncExternalStore } from "react";

export const TABLET_MIN_DP = 840;
export const SIDEBAR_FULL_MIN_DP = 1100;
export const WIDE_MIN_DP = 1200;

export type ShellMode = "phone" | "tablet";
export type SidebarMode = "full" | "rail";
export type RailMode = "column" | "sheet";

export function shellFor(widthDp: number): ShellMode {
  return widthDp >= TABLET_MIN_DP ? "tablet" : "phone";
}

export function sidebarFor(widthDp: number): SidebarMode {
  return widthDp >= SIDEBAR_FULL_MIN_DP ? "full" : "rail";
}

export function railFor(widthDp: number): RailMode {
  return widthDp >= WIDE_MIN_DP ? "column" : "sheet";
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

import type { Platform } from "./bridge";

export function hasCaptionButtons(platform: Platform): boolean {
  return platform === "windows" || platform === "linux";
}

export function usesNativeMediaControls(platform: Platform): boolean {
  return platform === "windows" || platform === "linux";
}

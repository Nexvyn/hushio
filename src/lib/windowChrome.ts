import type { Platform } from "./bridge";

export const MACOS_TRAFFIC_LIGHT_INSET = 84;

export function topBarLeadingInset(platform: Platform): number | undefined {
  return platform === "macos" ? MACOS_TRAFFIC_LIGHT_INSET : undefined;
}

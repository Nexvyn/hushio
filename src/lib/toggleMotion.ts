import { DURATION_MS, EASE_OUT } from "./motion";

export type ToggleKind = "shuffle" | "repeat" | "like";

export type ToggleKeyframes = {
  values: number[];
  duration: number;
  ease: typeof EASE_OUT;
};

export function toggleKeyframes(kind: ToggleKind, state: string, reduced: boolean): ToggleKeyframes | null {
  if (reduced || kind !== "like" || state !== "on") return null;
  return { values: [0.96, 1], duration: DURATION_MS.fade / 1000, ease: EASE_OUT };
}

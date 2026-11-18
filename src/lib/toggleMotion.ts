export type ToggleKind = "shuffle" | "repeat" | "like";

export type Ease = [number, number, number, number];

export const OVERSHOOT_EASE: Ease = [0.34, 1.56, 0.64, 1];
const SETTLE_EASE: Ease = [0.22, 1, 0.36, 1];

export type ToggleKeyframes = {
  prop: "x" | "rotate" | "scale";
  values: number[];
  duration: number;
  ease: Ease;
};

export function toggleKeyframes(kind: ToggleKind, state: string): ToggleKeyframes | null {
  if (kind === "shuffle") return state === "on" ? { prop: "x", values: [0, 3, -3, 0], duration: 0.32, ease: SETTLE_EASE } : null;
  if (kind === "repeat") return { prop: "rotate", values: [0, 180], duration: 0.4, ease: SETTLE_EASE };
  if (kind === "like") {
    return state === "on"
      ? { prop: "scale", values: [0.8, 1.15, 1], duration: 0.4, ease: OVERSHOOT_EASE }
      : { prop: "scale", values: [1, 0.85, 1], duration: 0.25, ease: SETTLE_EASE };
  }
  return null;
}

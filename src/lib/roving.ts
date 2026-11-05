export type RovingOrientation = "horizontal" | "vertical" | "both";

const STEP_KEYS: Record<string, { step: number; axis: "horizontal" | "vertical" }> = {
  ArrowUp: { step: -1, axis: "vertical" },
  ArrowDown: { step: 1, axis: "vertical" },
  ArrowLeft: { step: -1, axis: "horizontal" },
  ArrowRight: { step: 1, axis: "horizontal" },
};

export function rovingTarget(
  current: number,
  count: number,
  key: string,
  orientation: RovingOrientation,
): number | null {
  if (count === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const move = STEP_KEYS[key];
  if (!move) return null;
  if (orientation !== "both" && orientation !== move.axis) return null;
  const from = current < 0 ? (move.step > 0 ? -1 : count) : current;
  return Math.min(count - 1, Math.max(0, from + move.step));
}

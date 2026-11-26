export const ROLL_RADIUS_PX = 20;

export type RollStyles = { page: string; sheet: string; shade: number };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function rollSeam(progress: number, height: number): number {
  const p = clamp01(progress);
  return height * (1 - p);
}

export function rollStyles(progress: number, height: number, reduced: boolean): RollStyles {
  if (reduced) return { page: "none", sheet: "none", shade: 0 };
  const p = clamp01(progress);
  const radius = ROLL_RADIUS_PX * 4 * p * (1 - p);
  const seam = rollSeam(p, height);
  return {
    page: `inset(0px 0px ${Math.max(0, height - seam)}px 0px round 0px 0px ${radius}px ${radius}px)`,
    sheet: `inset(0px 0px 0px 0px round ${radius}px ${radius}px 0px 0px)`,
    shade: p,
  };
}

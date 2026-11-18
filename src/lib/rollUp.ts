export const ROLL_STRIP_PX = 84;
export const ROLL_RADIUS_PX = 20;

export type RollStyles = { page: string; sheet: string; shade: number };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function rollSeam(progress: number, height: number, strip: number = ROLL_STRIP_PX): number {
  const p = clamp01(progress);
  return strip + (height - strip) * (1 - p);
}

export function rollStyles(progress: number, height: number, reduced: boolean, strip: number = ROLL_STRIP_PX): RollStyles {
  if (reduced) return { page: "none", sheet: "none", shade: 0 };
  const p = clamp01(progress);
  const radius = ROLL_RADIUS_PX * p;
  const seam = rollSeam(p, height, strip);
  return {
    page: `inset(0px 0px ${Math.max(0, height - seam)}px 0px round 0px 0px ${radius}px ${radius}px)`,
    sheet: `inset(${strip * p}px 0px 0px 0px round ${radius}px ${radius}px 0px 0px)`,
    shade: p,
  };
}

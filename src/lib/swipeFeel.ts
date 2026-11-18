const RESIST_FACTOR = 0.25;
export const SIDEBAR_COMMIT_PX = 50;
export const TOP_BAR_COMMIT_PX = 31.2;
const DISC_RANGE_PX = 110;
const DISC_REACH_PX = 150;

export type SwipeSurface = "sidebar" | "topBar";

export function rubberBand(travel: number, beyondEnd: boolean): number {
  return beyondEnd ? travel * RESIST_FACTOR : travel;
}

export function commitDistance(surface: SwipeSurface): number {
  return surface === "sidebar" ? SIDEBAR_COMMIT_PX : TOP_BAR_COMMIT_PX;
}

export function shouldCommit(travel: number, surface: SwipeSurface): boolean {
  return Math.abs(travel) >= commitDistance(surface);
}

export function discPose(travel: number, back: boolean, going: boolean) {
  const distance = Math.abs(travel);
  const reach = DISC_REACH_PX * (1 - Math.exp(-distance / DISC_RANGE_PX));
  const grown = Math.min(1, distance / DISC_RANGE_PX);
  return {
    offsetX: (back ? 1 : -1) * (10 + 0.2 * reach + (going ? 12 : 0)),
    scale: going ? 1.08 : 0.86 + 0.14 * grown,
    arcOffset: 1 - grown,
  };
}

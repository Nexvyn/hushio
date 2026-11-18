import { swipeAxis, type Axis } from "./trackSwipe";

const PULL_AXIS_LOCK_PX = 8;
const MINI_AXIS_LOCK_PX = 8;

export type PullClaim = "pull" | "pending" | "release";

export function pullClaim(dx: number, dy: number, scrollTop: number): PullClaim {
  if (scrollTop > 0) return "release";
  const axis = swipeAxis(dx, dy, PULL_AXIS_LOCK_PX);
  if (axis === null) return "pending";
  if (axis === "x") return "release";
  return dy > 0 ? "pull" : "release";
}

export function miniAxis(dx: number, dy: number): Axis | null {
  return swipeAxis(dx, dy, MINI_AXIS_LOCK_PX);
}

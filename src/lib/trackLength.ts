import type { Track } from "../types";

export function shownDuration(playerSeconds: number, track: Track | null): number {
  if (playerSeconds > 0) return playerSeconds;
  const own = track?.duration;
  return own !== undefined && Number.isFinite(own) && own > 0 ? own : 0;
}

import type { Track } from "../types";
import { queuedEnd } from "./queueInsert";

export const RECOMMEND_EVERY = 3;
export const SMART_RETRY_MS = 30_000;

export function hasRecommendationAhead(queue: readonly Track[], index: number): boolean {
  return queue.slice(index + 1, index + 1 + RECOMMEND_EVERY).some((track) => track.recommended);
}

export function withRecommendation(queue: readonly Track[], index: number, track: Track): Track[] {
  const at = Math.max(Math.min(index + 1 + RECOMMEND_EVERY, queue.length), queuedEnd(queue, index));
  return [...queue.slice(0, at), { ...track, recommended: true }, ...queue.slice(at)];
}

export function withoutUpcomingRecommendations(queue: readonly Track[], index: number): Track[] {
  return [...queue.slice(0, index + 1), ...queue.slice(index + 1).filter((track) => !track.recommended)];
}

export function userTracks(tracks: readonly Track[]): Track[] {
  return tracks.filter((track) => !track.recommended);
}

export type ShuffleMode = "off" | "shuffle" | "smart";

export function shuffleModeOf(state: { shuffle: boolean; smartShuffle: boolean }): ShuffleMode {
  if (!state.shuffle) return "off";
  return state.smartShuffle ? "smart" : "shuffle";
}

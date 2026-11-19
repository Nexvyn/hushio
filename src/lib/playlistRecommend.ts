import type { Track } from "../types";
import { exclusionsFor, fetchSuggestions } from "./autoplay";

export const RECOMMEND_LIMIT = 10;
const SEED_COUNT = 3;
const sessionCache = new Map<string, Track[]>();

export function recommendationSeeds(tracks: readonly Track[], round = 0): string[] {
  if (tracks.length === 0) return [];
  const count = Math.min(SEED_COUNT, tracks.length);
  const step = tracks.length / count;
  const seeds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = tracks[(Math.floor(i * step) + round) % tracks.length].id;
    if (!seeds.includes(id)) seeds.push(id);
  }
  return seeds;
}

export function cachedRecommendations(playlistId: string): Track[] | undefined {
  return sessionCache.get(playlistId);
}

export function storeRecommendations(playlistId: string, rows: Track[]): void {
  sessionCache.set(playlistId, rows);
}

export function resetRecommendationCache(): void {
  sessionCache.clear();
}

export function loadRecommendations(tracks: readonly Track[], shown: readonly Track[], round: number): Promise<Track[]> {
  return fetchSuggestions(recommendationSeeds(tracks, round), exclusionsFor([...tracks, ...shown]), RECOMMEND_LIMIT);
}

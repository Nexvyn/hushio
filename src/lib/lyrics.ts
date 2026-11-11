import { lyricsGet, type LyricsResult } from "./bridge";
import { useSettings } from "../stores/settings";
import type { Track } from "../types";

export const LYRICS_CACHE_LIMIT = 24;
export const LYRICS_RETRY_MS = 30_000;

const cache = new Map<string, Promise<LyricsResult | null>>();
const retryAfter = new Map<string, number>();

function hasText(result: LyricsResult | null): result is LyricsResult {
  return result !== null && ((result.synced?.length ?? 0) > 0 || (result.plain?.trim().length ?? 0) > 0);
}

export function requestLyrics(track: Track, duration = 0): Promise<LyricsResult | null> {
  const cached = cache.get(track.id);
  if (cached) return cached;
  if (Date.now() < (retryAfter.get(track.id) ?? 0)) return Promise.resolve(null);

  const providers = useSettings.getState().lyricsProviders;
  const request: Promise<LyricsResult | null> = lyricsGet({
    id: track.id,
    title: track.title,
    artist: track.artist,
    duration: duration > 0 ? duration : undefined,
    providers: [...providers],
  })
    .catch(() => null)
    .then((result) => {
      if (hasText(result)) return result;
      retryAfter.set(track.id, Date.now() + LYRICS_RETRY_MS);
      if (cache.get(track.id) === request) cache.delete(track.id);
      return null;
    });

  cache.set(track.id, request);
  if (cache.size > LYRICS_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return request;
}

export function prefetchLyrics(track: Track): void {
  void requestLyrics(track);
}

export function replaceLyrics(trackId: string, result: LyricsResult): void {
  retryAfter.delete(trackId);
  cache.set(trackId, Promise.resolve(result));
}

export function forgetLyrics(trackId: string): void {
  retryAfter.delete(trackId);
  cache.delete(trackId);
}

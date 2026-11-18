export type CanvasClip = { url: string };

export const CANVAS_CACHE_LIMIT = 256;

const clips = new Map<string, CanvasClip>();
const misses = new Set<string>();

export function rememberCanvasClip(trackId: string, clip: CanvasClip): void {
  clips.delete(trackId);
  clips.set(trackId, clip);
  if (clips.size > CANVAS_CACHE_LIMIT) {
    const oldest = clips.keys().next().value;
    if (oldest !== undefined) clips.delete(oldest);
  }
}

export function canvasClipFor(trackId: string): CanvasClip | null {
  return clips.get(trackId) ?? null;
}

export function rememberCanvasMiss(trackId: string): void {
  misses.delete(trackId);
  misses.add(trackId);
  if (misses.size > CANVAS_CACHE_LIMIT) {
    const oldest = misses.values().next().value;
    if (oldest !== undefined) misses.delete(oldest);
  }
}

export function canvasMissFor(trackId: string): boolean {
  return misses.has(trackId);
}

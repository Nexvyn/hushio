export type Clip = { start: number; end: number };

const CUE_TRACK_ID = /^local:[0-9a-f]{16}-\d+$/;
const END_TOLERANCE_S = 0.05;

export function isCueTrackId(id: string | undefined): boolean {
  return id !== undefined && CUE_TRACK_ID.test(id);
}

export function clipFrom(cueStart?: number, cueEnd?: number): Clip | undefined {
  if (cueStart === undefined || cueEnd === undefined) return undefined;
  if (!Number.isFinite(cueStart) || !Number.isFinite(cueEnd) || cueEnd <= cueStart) return undefined;
  return { start: Math.max(0, cueStart), end: cueEnd };
}

export function clipLength(clip: Clip): number {
  return clip.end - clip.start;
}

function clampTo(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, value));
}

export function clipPosition(deckTime: number, clip: Clip | null | undefined): number {
  if (!clip) return deckTime;
  return clampTo(deckTime - clip.start, clipLength(clip));
}

export function clipDeckTime(position: number, clip: Clip | null | undefined): number {
  if (!clip) return position;
  return clip.start + clampTo(position, clipLength(clip));
}

export function clipDuration(deckDuration: number, clip: Clip | null | undefined): number {
  if (!clip) return deckDuration;
  return clipLength(clip);
}

export function clipEnded(deckTime: number, clip: Clip | null | undefined): boolean {
  return clip !== null && clip !== undefined && Number.isFinite(deckTime) && deckTime >= clip.end - END_TOLERANCE_S;
}

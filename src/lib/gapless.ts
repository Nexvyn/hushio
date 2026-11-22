import type { RepeatMode } from "./queue";

export const GAPLESS_LEAD_S = 8;

export function gaplessEligible(options: {
  enabled: boolean;
  crossfadeSeconds: number;
  smartFade: boolean;
  exclusive: boolean;
}): boolean {
  return options.enabled && !options.exclusive && !options.smartFade && !(options.crossfadeSeconds > 0);
}

export function shouldPrepareGapless(remainingS: number, durationS: number): boolean {
  return Number.isFinite(durationS) && durationS > 0 && remainingS <= Math.min(GAPLESS_LEAD_S, durationS);
}

export function gaplessNextIndex(length: number, index: number, repeat: RepeatMode, shuffle: boolean): number {
  if (repeat === "one") return index;
  if (index + 1 < length) return index + 1;
  return repeat === "all" && !shuffle ? 0 : -1;
}

export function keepsPrepared(
  prepared: { fromId: string; toId: string },
  currentId: string | undefined,
  nextId: string | undefined,
  eligible: boolean,
): boolean {
  return eligible && prepared.fromId === currentId && prepared.toId === nextId;
}

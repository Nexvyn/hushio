import type { SyncedLyricLine, SyncedLyricWord } from "./bridge";

const LOOKAHEAD_S = 0.35;
export const SEEK_LEAD_IN_S = 0.15;
const FALLBACK_LINE_S = 4;
const FALLBACK_MIN_S = 3;
const LAST_WORD_FLOOR_S = 1;
const WORD_START_TOLERANCE_S = 0.25;
const WORD_END_TOLERANCE_S = 0.5;
const MIN_WORD_S = 0.04;
const WRAPPED_LINE = /^\(.*\)$/;
const CREDIT_LINE = /^[^:：]{1,40}[:：]\s*\S/;
const CREDIT_WORDS = /\b(written|composed|lyrics?|produced|music\s+by)\b|[:：]/i;
const SECTION_LABEL = /^\[[^\]]+\]$/;

export type WordSpan = { start: number; end: number };

function isOpeningCredit(line: SyncedLyricLine): boolean {
  const text = line.text.trim();
  if (WRAPPED_LINE.test(text)) return CREDIT_WORDS.test(text);
  return line.time === 0 && CREDIT_LINE.test(text);
}

export function visibleLyricLines(lines: readonly SyncedLyricLine[]): SyncedLyricLine[] {
  let start = 0;
  while (start < lines.length && isOpeningCredit(lines[start])) start++;
  return lines.slice(start);
}

export function isSectionLabel(text: string): boolean {
  return SECTION_LABEL.test(text.trim());
}

export function activeLineIndex(lines: readonly SyncedLyricLine[], lyricPosition: number): number {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time > lyricPosition + LOOKAHEAD_S) break;
    index = i;
  }
  return index;
}

export function sweepWindow(lines: readonly SyncedLyricLine[], index: number): [number, number] {
  const line = lines[index];
  const nextTime = lines[index + 1]?.time;
  let end = nextTime ?? line.time + FALLBACK_LINE_S;
  const lastWordEnd = line.words?.at(-1)?.end ?? 0;
  if (lastWordEnd > line.time) end = Math.min(end, Math.max(lastWordEnd, line.time + LAST_WORD_FLOOR_S));
  if (end <= line.time) end = line.time + FALLBACK_MIN_S;
  return [line.time, end];
}

export function resolveWordSpans(words: readonly SyncedLyricWord[], start: number, end: number): WordSpan[] {
  const sane =
    words.length > 0 &&
    words.every(
      (word) =>
        word.end > word.start &&
        word.start >= start - WORD_START_TOLERANCE_S &&
        word.end <= end + WORD_END_TOLERANCE_S,
    );
  if (sane) {
    return words.map((word) => ({
      start: Math.max(start, word.start),
      end: Math.min(end, Math.max(word.start + MIN_WORD_S, word.end)),
    }));
  }
  const count = words.length || 1;
  const step = (end - start) / count;
  return Array.from({ length: count }, (_, i) => ({ start: start + step * i, end: start + step * (i + 1) }));
}

export function wordPercent(position: number, span: WordSpan): number {
  const length = span.end - span.start;
  const progress =
    length <= 0 ? (position >= span.start ? 1 : 0) : Math.min(1, Math.max(0, (position - span.start) / length));
  return Math.round(progress * 100);
}

const FALLOFF_OPACITY = [1, 0.8, 0.7, 0.58, 0.46] as const;
const FALLOFF_BLUR_PX = [0, 1, 1, 1.7, 2.4] as const;

export function lyricFalloff(distance: number): { opacity: number; blurPx: number } {
  const step = Math.min(Math.abs(distance), FALLOFF_OPACITY.length - 1);
  return { opacity: FALLOFF_OPACITY[step], blurPx: FALLOFF_BLUR_PX[step] };
}


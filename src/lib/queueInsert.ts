import type { Track } from "../types";

export function queuedEnd(queue: readonly Track[], index: number): number {
  let end = index + 1;
  while (end < queue.length && queue[end].queued) end++;
  return end;
}

export function insertIndexAt(y: number, rows: readonly { at: number; top: number; height: number }[], end: number): number {
  for (const row of rows) {
    if (y < row.top + row.height / 2) return row.at;
  }
  return end;
}

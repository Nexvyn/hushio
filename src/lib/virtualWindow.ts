export const VIRTUAL_THRESHOLD = 200;
export const TRACK_ROW_DP = 56;
const OVERSCAN_ROWS = 6;

export type RowWindow = { start: number; end: number };

export function usesWindowing(count: number): boolean {
  return count > VIRTUAL_THRESHOLD;
}

export function rowWindow({
  count,
  rowHeight,
  offset,
  viewport,
  overscan = OVERSCAN_ROWS,
}: {
  count: number;
  rowHeight: number;
  offset: number;
  viewport: number;
  overscan?: number;
}): RowWindow {
  if (count <= 0) return { start: 0, end: 0 };
  if (!usesWindowing(count)) return { start: 0, end: count };
  const first = Math.floor(Math.max(0, offset) / rowHeight);
  const visible = Math.ceil(Math.max(0, viewport) / rowHeight);
  const start = Math.min(count, Math.max(0, first - overscan));
  const end = Math.min(count, first + visible + overscan);
  return { start, end };
}

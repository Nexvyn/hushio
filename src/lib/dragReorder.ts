export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from < 0 || from >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(Math.max(0, to), next.length), 0, moved);
  return next;
}

export function dropIndex(from: number, travelPx: number, rowPx: number, count: number): number {
  if (count <= 0 || rowPx <= 0) return 0;
  const target = from + Math.round(travelPx / rowPx);
  return Math.min(count - 1, Math.max(0, target));
}

export function slideOffset(index: number, from: number, to: number, rowPx: number): number {
  if (index === from || from === to) return 0;
  if (from < to && index > from && index <= to) return -rowPx;
  if (from > to && index >= to && index < from) return rowPx;
  return 0;
}

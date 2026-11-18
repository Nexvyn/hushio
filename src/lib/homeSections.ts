import type { FeedSection } from "./feed";

export const HOME_SECTION_KEYS = [
  "jump-back-in",
  "playlists-for-you",
  "browse",
  "your-mixes",
  "heavy-rotation",
  "favorite-artists",
  "more-like",
  "recommended-today",
  "new-from-your-artists",
  "dust-off",
  "stations",
  "albums-for-you",
  "because",
  "market",
] as const;

export function orderHomeSections(
  sections: FeedSection[],
  order: string[],
  hidden: string[],
): FeedSection[] {
  const hiddenSet = new Set(hidden);
  const shown = sections.filter((section) => !hiddenSet.has(section.kind));
  const rank = new Map(order.map((key, index) => [key, index]));
  return [...shown].sort((a, b) => {
    const left = rank.get(a.kind) ?? Number.MAX_SAFE_INTEGER;
    const right = rank.get(b.kind) ?? Number.MAX_SAFE_INTEGER;
    if (left === right) return 0;
    return left - right;
  });
}

export function moveHomeSection(order: string[], from: number, to: number): string[] {
  if (from < 0 || from >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(Math.max(0, to), next.length), 0, moved);
  return next;
}

export function toggleHiddenSection(hidden: string[], key: string): string[] {
  return hidden.includes(key) ? hidden.filter((entry) => entry !== key) : [...hidden, key];
}

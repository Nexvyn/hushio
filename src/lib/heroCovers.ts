export const HERO_WALL_MIN = 3;
export const HERO_COVER_LIMIT = 12;

export function distinctCovers(
  sources: readonly (readonly (string | null | undefined)[])[],
  limit: number = HERO_COVER_LIMIT,
): string[] {
  const seen = new Set<string>();
  const picked: string[] = [];
  const longest = sources.reduce((max, source) => Math.max(max, source.length), 0);
  for (let index = 0; index < longest && picked.length < limit; index += 1) {
    for (const source of sources) {
      const src = source[index];
      if (!src || seen.has(src)) continue;
      seen.add(src);
      picked.push(src);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

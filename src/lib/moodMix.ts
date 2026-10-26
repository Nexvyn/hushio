export const MIX_SIZE = 60;

export function buildMix<T extends { id: string }>(sources: readonly (readonly T[])[], size = MIX_SIZE): T[] {
  const seen = new Set<string>();
  const mix: T[] = [];
  const longest = Math.max(0, ...sources.map((source) => source.length));
  for (let turn = 0; turn < longest && mix.length < size; turn++) {
    for (const source of sources) {
      const track = source[turn];
      if (!track || seen.has(track.id)) continue;
      seen.add(track.id);
      mix.push(track);
      if (mix.length >= size) break;
    }
  }
  return mix;
}

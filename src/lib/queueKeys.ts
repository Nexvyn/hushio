type Keyed = { id: string };

export function queueEntryKeys(queue: readonly Keyed[]): string[] {
  const seen = new Map<string, number>();
  return queue.map((track) => {
    const occurrence = seen.get(track.id) ?? 0;
    seen.set(track.id, occurrence + 1);
    return `${track.id}#${occurrence}`;
  });
}

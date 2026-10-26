export function arrange(defaults: readonly string[], saved: readonly string[]): string[] {
  const known = new Set(defaults);
  let order = [...new Set(saved)].filter((key) => known.has(key));

  defaults.forEach((key, index) => {
    if (order.includes(key)) return;
    const predecessor = index === 0 ? -1 : order.indexOf(defaults[index - 1]);
    order = [...order.slice(0, predecessor + 1), key, ...order.slice(predecessor + 1)];
  });

  return order;
}

export function moveKey<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

import type { Track } from "../types";
import { queuedEnd } from "./queueInsert";

export type RepeatMode = "off" | "all" | "one";

export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function nextPass(queue: readonly Track[]): Track[] {
  const out = seededShuffle(queue, hash32(queue.map((track) => track.id).join()));
  const last = queue.at(-1)?.id;
  if (out.length > 1 && out[0].id === last) {
    const swap = out.findIndex((track) => track.id !== last);
    if (swap > 0) [out[0], out[swap]] = [out[swap], out[0]];
  }
  return out;
}

export function advance(
  queue: readonly Track[],
  index: number,
  shuffle: boolean,
): { queue: Track[]; index: number } {
  if (index + 1 < queue.length) return { queue: [...queue], index: index + 1 };
  return { queue: shuffle ? nextPass(queue) : [...queue], index: 0 };
}

export function orderFrom(queue: readonly Track[], index: number): string[] {
  return [...queue.slice(index), ...queue.slice(0, index)].map((track) => track.id);
}

export function shuffleUpcoming(queue: readonly Track[], index: number): Track[] {
  const end = queuedEnd(queue, index);
  return [...queue.slice(0, end), ...seededShuffle(queue.slice(end), randomSeed())];
}

export function inYourOrder(queue: readonly Track[], index: number, order: readonly string[]): Track[] {
  const n = order.length;
  const current = queue[index];
  const from = current ? order.indexOf(current.id) : -1;
  const rank = (id: string) => {
    const place = order.indexOf(id);
    return place < 0 ? n : (place - from - 1 + n) % n;
  };
  const upcoming = queue
    .slice(index + 1)
    .map((track, i) => ({ track, rank: rank(track.id), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((entry) => entry.track);
  return [...queue.slice(0, index + 1), ...upcoming];
}

export function insertIds(order: readonly string[], ids: readonly string[], afterId: string | undefined): string[] {
  const at = afterId === undefined ? -1 : order.indexOf(afterId);
  if (at < 0) return [...order, ...ids];
  return [...order.slice(0, at + 1), ...ids, ...order.slice(at + 1)];
}

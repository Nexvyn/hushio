import { hash32, mulberry32, seededShuffle } from "./queue";

const DAY_MS = 86_400_000;
const DAY_SALT = 2654435761;

export function dayBucket(now = Date.now()): number {
  return Math.floor(now / DAY_MS);
}

export function daySeed(now = Date.now()): number {
  return dayBucket(now) * DAY_SALT;
}

export function seededUnit(key: string, seed: number): number {
  return mulberry32(hash32(key) ^ seed)();
}

export function dailyRotation<T>(items: readonly T[], seedKey: string, seed: number): T[] {
  return seededShuffle(items, hash32(seedKey) ^ seed);
}

import type { LoudnessLevel } from "../stores/settings";

export const LOUDNESS_TARGETS: Record<Exclude<LoudnessLevel, "off">, number> = {
  quiet: -19,
  normal: -14,
  loud: -11,
};
export const FALLBACK_LUFS = -9;
export const MASTER_TRIM = 1;
export const LEVEL_GLIDE_MS = 2000;
export const GAINS_MAX = 600;
export const ANALYSIS_MIN_S = 10;
export const ANALYSIS_MAX_S = 1200;
const MIN_GAIN = 0.05;
const GLIDE_EPSILON = 1e-4;

export function gainForLufs(lufs: number, target: number): number {
  const measured = Number.isFinite(lufs) ? lufs : FALLBACK_LUFS;
  return Math.min(1, Math.max(MIN_GAIN, 10 ** ((target - measured) / 20)));
}

export function gainForTrack(lufs: number | null, level: LoudnessLevel): number {
  if (level === "off") return MASTER_TRIM;
  return gainForLufs(lufs ?? FALLBACK_LUFS, LOUDNESS_TARGETS[level]) * MASTER_TRIM;
}

export function analysable(duration: number): boolean {
  return duration >= ANALYSIS_MIN_S && duration <= ANALYSIS_MAX_S;
}

export class Lru<V> {
  private readonly items = new Map<string, V>();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  get(key: string): V | undefined {
    return this.items.get(key);
  }

  set(key: string, value: V): void {
    this.items.delete(key);
    this.items.set(key, value);
    while (this.items.size > this.limit) {
      const oldest = this.items.keys().next();
      if (oldest.done) return;
      this.items.delete(oldest.value);
    }
  }
}

type Glide = { from: number; at: number };

export class Leveling {
  private readonly lufs = new Lru<number>(GAINS_MAX);
  private readonly glides = new Map<string, Glide>();
  private readonly level: () => LoudnessLevel;

  constructor(level: () => LoudnessLevel) {
    this.level = level;
  }

  known(id: string): boolean {
    return this.lufs.has(id);
  }

  gainOf(id: string | undefined, now: number): number {
    if (id === undefined) return MASTER_TRIM;
    const target = gainForTrack(this.lufs.get(id) ?? null, this.level());
    const glide = this.glides.get(id);
    if (!glide) return target;
    const p = Math.min(1, (now - glide.at) / LEVEL_GLIDE_MS);
    return glide.from + ((target - glide.from) * (1 - Math.cos(Math.PI * p))) / 2;
  }

  setLoudness(id: string, lufs: number, heard: boolean, now: number): void {
    if (this.lufs.get(id) === lufs) {
      this.lufs.set(id, lufs);
      return;
    }
    const from = this.gainOf(id, now);
    this.lufs.set(id, lufs);
    const to = gainForTrack(lufs, this.level());
    if (heard && Math.abs(to - from) > GLIDE_EPSILON) this.glides.set(id, { from, at: now });
    else this.glides.delete(id);
  }

  gliding(): boolean {
    return this.glides.size > 0;
  }

  tick(now: number): void {
    for (const [id, glide] of this.glides) {
      if (now - glide.at > LEVEL_GLIDE_MS) this.glides.delete(id);
    }
  }

  clearGlides(): void {
    this.glides.clear();
  }
}

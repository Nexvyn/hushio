export const EQ_BANDS_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BAND_LABELS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"] as const;
export const EQ_RANGE = 12;
export const EQ_H = 160;
export const EQ_THUMB = 16;
export const EQ_BAND_HIT = 40;
export const EQ_RULES = [12, 6, 0, -6, -12] as const;
export const EQ_PRESET_LIMIT = 20;
export const EQ_PRESET_NAME_LIMIT = 40;

export const EQ_PRESETS: Readonly<Record<string, readonly number[]>> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  Treble: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Vocal: [-2, -2, -1, 0, 2, 4, 4, 2, 0, -1],
  Loudness: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
};

export type EqPreset = { name: string; gains: number[] };
export type PresetNameError = "empty" | "builtin" | "duplicate" | "long";
export type PresetNameResult = { name: string; error?: undefined } | { name?: undefined; error: PresetNameError };

export function flatGains(): number[] {
  return EQ_BANDS_HZ.map(() => 0);
}

export function clampEqGain(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(EQ_RANGE, Math.max(-EQ_RANGE, Math.round(value))) || 0;
}

export function normalizeEqGains(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== EQ_BANDS_HZ.length) return flatGains();
  return value.map((gain) => clampEqGain(Number(gain)));
}

export function formatEqGain(gain: number): string {
  if (gain > 0) return `+${gain}`;
  if (gain < 0) return `−${Math.abs(gain)}`;
  return "0";
}

export function eqY(gain: number, height = EQ_H, thumb = EQ_THUMB): number {
  const clamped = Math.min(EQ_RANGE, Math.max(-EQ_RANGE, gain));
  return thumb / 2 + (1 - (clamped + EQ_RANGE) / (2 * EQ_RANGE)) * (height - thumb);
}

export function isBuiltInEqPreset(name: string): boolean {
  return Object.hasOwn(EQ_PRESETS, name);
}

export function sameGains(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((gain, index) => gain === b[index]);
}

export function presetMatching(gains: readonly number[], presets: readonly EqPreset[]): string | null {
  const builtIn = Object.keys(EQ_PRESETS).find((name) => sameGains(EQ_PRESETS[name], gains));
  if (builtIn !== undefined) return builtIn;
  return presets.find((preset) => sameGains(preset.gains, gains))?.name ?? null;
}

export function cleanPresetName(raw: string): string {
  return raw.trim().slice(0, EQ_PRESET_NAME_LIMIT).trim();
}

export function checkPresetName(raw: string, presets: readonly EqPreset[], current?: string): PresetNameResult {
  const name = raw.trim();
  if (name === "") return { error: "empty" };
  if (name.length > EQ_PRESET_NAME_LIMIT) return { error: "long" };
  if (isBuiltInEqPreset(name)) return { error: "builtin" };
  if (name !== current && presets.some((preset) => preset.name === name)) return { error: "duplicate" };
  return { name };
}

export function presetNameMessage(error: PresetNameError, name: string): string {
  if (error === "builtin") return `"${name}" is a built-in preset. Pick another name`;
  if (error === "duplicate") return `You already have a preset called "${name}"`;
  if (error === "long") return `Names can be up to ${EQ_PRESET_NAME_LIMIT} characters`;
  return "Give the preset a name";
}

function capped(presets: EqPreset[]): EqPreset[] {
  return presets.slice(-EQ_PRESET_LIMIT);
}

export function addEqPreset(presets: readonly EqPreset[], name: string, gains: readonly number[]): EqPreset[] {
  return capped([...presets, { name, gains: [...gains] }]);
}

export function renameEqPreset(presets: readonly EqPreset[], from: string, to: string): EqPreset[] {
  return presets.map((preset) => (preset.name === from ? { ...preset, name: to } : preset));
}

export function updateEqPreset(presets: readonly EqPreset[], name: string, gains: readonly number[]): EqPreset[] {
  return capped([...presets.filter((preset) => preset.name !== name), { name, gains: [...gains] }]);
}

export function deleteEqPreset(presets: readonly EqPreset[], name: string): EqPreset[] {
  return presets.filter((preset) => preset.name !== name);
}

function presetFrom(entry: unknown): EqPreset[] {
  if (typeof entry !== "object" || entry === null || !("name" in entry) || !("gains" in entry)) return [];
  const { name, gains } = entry;
  if (typeof name !== "string") return [];
  const checked = checkPresetName(cleanPresetName(name), []);
  if (checked.name === undefined) return [];
  return [{ name: checked.name, gains: normalizeEqGains(gains) }];
}

export function normalizeEqPresets(value: unknown): EqPreset[] {
  if (!Array.isArray(value)) return [];
  const presets = value.flatMap(presetFrom);
  return capped(presets.filter((preset, index) => presets.findIndex((other) => other.name === preset.name) === index));
}

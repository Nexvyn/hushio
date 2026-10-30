export const SLEEP_FADE_MS = 10_000;
export const SLEEP_MAX_MINUTES = 720;
export const SLEEP_RESTORE_MS = 500;
export const SLEEP_TICK_MS = 250;

export const SLEEP_PRESETS: { label: string; minutes: number }[] = [
  { label: "5 minutes", minutes: 5 },
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "45 minutes", minutes: 45 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];

export function parseSleepMinutes(input: string): number | null {
  const value = input.trim().toLowerCase();
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (/^\d{1,4}$/.test(value)) return Number(value);
  const units = /^(?:(\d{1,2})\s*h)?\s*(?:(\d{1,3})\s*m(?:in)?)?$/.exec(value);
  if (!units || (units[1] === undefined && units[2] === undefined)) return null;
  return Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0);
}

export function formatSleepLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  return `${minutes}:${seconds}`;
}

export function sleepLevel(remainingMs: number): number {
  return Math.min(1, Math.max(0, remainingMs / SLEEP_FADE_MS));
}

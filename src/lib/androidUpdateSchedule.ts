export const ANDROID_UPDATE_FIRST_CHECK_MS = 10_000;
export const ANDROID_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const ANDROID_UPDATE_TICK_MS = 60 * 60 * 1000;

export function shouldCheck(lastCheck: number | null, now: number, enabled: boolean, online: boolean): boolean {
  if (!enabled || !online) return false;
  if (lastCheck === null) return true;
  const elapsed = now - lastCheck;
  return elapsed < 0 || elapsed >= ANDROID_UPDATE_INTERVAL_MS;
}

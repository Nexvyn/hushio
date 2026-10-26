export function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}

export const PAGE_TITLE_SIZE = ["text-[34px]", "text-[28px]", "text-[24px]"] as const;

export function titleStep(name: string): 0 | 1 | 2 {
  if (name.length <= 26) return 0;
  return name.length <= 48 ? 1 : 2;
}

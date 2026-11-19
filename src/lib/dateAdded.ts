const DAY_MS = 24 * 60 * 60 * 1000;

export function formatAddedAt(at: number | undefined, now: number): string {
  if (at === undefined) return "";
  const days = Math.floor((now - at) / DAY_MS);
  if (days < 0 || days >= 7) {
    return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export type JournalEntry = {
  track: { id: string; title: string; artist: string; thumb: string | null };
  at: number;
  heard: number;
};

export type ReplayPeriod = "week" | "month" | "lastMonth" | "year" | "all";

export const REPLAY_PERIODS: { id: ReplayPeriod; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
];

type ReplayTrack = { id: string; title: string; artist: string; thumb: string | null; ms: number; plays: number };
type ReplayArtist = { name: string; ms: number; plays: number };
type ReplayAlbum = { title: string; artist: string; thumb: string | null; ms: number; plays: number };
export type DayMs = { date: string; ms: number };

export type ReplayData = {
  period: ReplayPeriod;
  months: string[];
  totalMs: number;
  plays: number;
  tracks: ReplayTrack[];
  artists: ReplayArtist[];
  albums: ReplayAlbum[];
  hours: number[];
  days: DayMs[];
  counts: { tracks: number; artists: number; albums: number };
};

const LIST_LIMIT = 50;
const UNKNOWN_ARTIST = "unknown artist";
const CREDIT_SPLIT = /\s*(?:,|&|\bfeat\.?(?=\s)|\bft\.?(?=\s)|\bfeaturing\b)\s*/i;

export function fmtMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function fmtHours(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} min`;
  const value = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return `${value.toLocaleString()} ${value === 1 ? "hr" : "hrs"}`;
}

export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function shiftDay(date: Date, by: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + by, 12);
}

export function activityDays(period: ReplayPeriod, days: DayMs[], today: Date): DayMs[] {
  const byDate = new Map(days.map((entry) => [entry.date, entry.ms]));
  let from = shiftDay(today, -27);
  let to = today;
  if (period === "week") from = shiftDay(today, -6);
  if (period === "month") from = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  if (period === "lastMonth") {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
    to = new Date(today.getFullYear(), today.getMonth(), 0, 12);
  }
  const out: DayMs[] = [];
  for (let cursor = from; cursor <= to; cursor = shiftDay(cursor, 1)) {
    const date = isoDay(cursor);
    out.push({ date, ms: byDate.get(date) ?? 0 });
  }
  return out;
}

export function activeDayCount(days: DayMs[]): number {
  return days.filter((entry) => entry.ms > 0).length;
}

const REPLAY_MIN_TRACKS = 3;

export function isThinHistory(data: ReplayData): boolean {
  return data.totalMs === 0 || data.counts.tracks < REPLAY_MIN_TRACKS;
}

export type DayPart = "night" | "morning" | "afternoon" | "evening";

const DAY_PARTS: { id: DayPart; label: string; from: number; to: number }[] = [
  { id: "night", label: "Night", from: 0, to: 5 },
  { id: "morning", label: "Morning", from: 6, to: 11 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { id: "evening", label: "Evening", from: 18, to: 23 },
];

export function dayPartShares(hours: number[]): { id: DayPart; label: string; share: number }[] {
  const total = hours.reduce((sum, value) => sum + value, 0);
  return DAY_PARTS.map((part) => {
    let ms = 0;
    for (let hour = part.from; hour <= part.to; hour += 1) ms += hours[hour] ?? 0;
    return { id: part.id, label: part.label, share: total > 0 ? ms / total : 0 };
  });
}

export function topDayPart(hours: number[]): { id: DayPart; label: string; share: number } | null {
  let best: { id: DayPart; label: string; share: number } | null = null;
  for (const part of dayPartShares(hours)) {
    if (part.share > 0 && (best === null || part.share > best.share)) best = part;
  }
  return best;
}

export function biggestDay(days: DayMs[]): DayMs | null {
  let best: DayMs | null = null;
  for (const entry of days) {
    if (entry.ms > 0 && (best === null || entry.ms > best.ms)) best = entry;
  }
  return best;
}

export function peakHour(hours: number[]): number | null {
  let peak: number | null = null;
  hours.forEach((value, hour) => {
    if (value > 0 && (peak === null || value > hours[peak])) peak = hour;
  });
  return peak;
}

export function creditNames(line: string): string[] {
  const names = line
    .split(CREDIT_SPLIT)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.length > 0 ? names : [line.trim()];
}

const monthFormat = (year: number, month0: number, options: Intl.DateTimeFormatOptions) =>
  new Date(year, month0, 1).toLocaleString("en-US", options);

export function periodLabel(period: ReplayPeriod, now: Date, months: string[]): string {
  switch (period) {
    case "week":
      return "The last seven days";
    case "month":
      return monthFormat(now.getFullYear(), now.getMonth(), { month: "long", year: "numeric" });
    case "lastMonth":
      return monthFormat(now.getFullYear(), now.getMonth() - 1, { month: "long", year: "numeric" });
    case "year":
      return String(now.getFullYear());
    case "all": {
      const first = months[0];
      if (!first) return "All time";
      const [year, month] = first.split("-").map(Number);
      return `Since ${monthFormat(year, month - 1, { month: "short", year: "numeric" })}`;
    }
  }
}

export function journalReplay(entries: JournalEntry[], now: Date): ReplayData {
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  const tracks = new Map<string, { track: ReplayTrack; at: number }>();
  const artists = new Map<string, ReplayArtist>();
  const creditKeys = new Set<string>();
  const hours = new Array<number>(24).fill(0);
  const days = new Map<string, number>();

  for (const entry of entries) {
    if (entry.at < windowStart || entry.at > now.getTime()) continue;
    const ms = Math.max(0, entry.heard) * 1000;
    const began = new Date(entry.at - ms);
    hours[began.getHours()] += ms;
    const day = isoDay(began);
    days.set(day, (days.get(day) ?? 0) + ms);

    const { id, title, artist, thumb } = entry.track;
    const current = tracks.get(id);
    const newest = !current || entry.at >= current.at;
    tracks.set(id, {
      track: {
        id,
        title: newest ? title : current.track.title,
        artist: newest ? artist : current.track.artist,
        thumb: newest ? thumb : current.track.thumb,
        ms: (current?.track.ms ?? 0) + ms,
        plays: (current?.track.plays ?? 0) + 1,
      },
      at: newest ? entry.at : current.at,
    });

    const key = artist.toLowerCase();
    if (key && key !== UNKNOWN_ARTIST) {
      const artistRow = artists.get(key) ?? { name: artist, ms: 0, plays: 0 };
      artistRow.ms += ms;
      artistRow.plays += 1;
      artists.set(key, artistRow);
      for (const name of creditNames(artist)) creditKeys.add(name.toLowerCase());
    }
  }

  const trackRows = [...tracks.values()].map((row) => row.track);
  const totalMs = trackRows.reduce((sum, row) => sum + row.ms, 0);
  return {
    period: "week",
    months: [],
    totalMs,
    plays: trackRows.reduce((sum, row) => sum + row.plays, 0),
    tracks: sortByMs(trackRows).slice(0, LIST_LIMIT),
    artists: sortByMs([...artists.values()]).slice(0, LIST_LIMIT),
    albums: [],
    hours,
    days: [...days.entries()].map(([date, ms]) => ({ date, ms })).sort((a, b) => a.date.localeCompare(b.date)),
    counts: { tracks: trackRows.length, artists: creditKeys.size, albums: 0 },
  };
}

function sortByMs<T extends { ms: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.ms - a.ms);
}

export function replayEmptyMessage(period: ReplayPeriod): string {
  if (period === "week") return "Your week fills in as you listen. Play a few different songs and they will show up here.";
  return "Play at least three different songs and Replay fills in with what you actually listen to.";
}

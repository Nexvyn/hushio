import type { JournalEntry } from "./replay";
import type { Track } from "../types";

export type HistoryGroup = { key: string; label: string; entries: JournalEntry[] };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function labelFor(key: string, date: Date, today: string, yesterday: string): string {
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function sortNewestFirst(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.at - a.at);
}

export function groupHistory(entries: readonly JournalEntry[], now: Date): HistoryGroup[] {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: HistoryGroup[] = [];
  for (const entry of sortNewestFirst(entries)) {
    const date = new Date(entry.at);
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: labelFor(key, date, today, yesterday), entries: [entry] });
    }
  }
  return groups;
}

export function historyTracks(entries: readonly JournalEntry[]): Track[] {
  return entries.map((entry) => ({
    id: entry.track.id,
    title: entry.track.title,
    artist: entry.track.artist,
    thumb: entry.track.thumb,
  }));
}

export function isSamePlay(a: JournalEntry, b: JournalEntry): boolean {
  return a.at === b.at && a.track.id === b.track.id;
}

export function playKey(entry: JournalEntry): { at: number; id: string } {
  return { at: entry.at, id: entry.track.id };
}

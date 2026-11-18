import type { Track } from '../types';
import { dailyRotation } from './seeded';
import type { JournalEntry } from './replay';

function interleave(profiles: Record<string, Track[]>, seed: number): Track[] {
  const lists = Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b))
    .map(([id, tracks]) => dailyRotation(tracks, id, seed));
  const seen = new Set<string>();
  const result: Track[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map(list => list.length)); i++) {
    for (const list of lists) {
      const track = list[i];
      if (track && !seen.has(track.id)) { seen.add(track.id); result.push(track); }
      if (result.length === 50) return result;
    }
  }
  return result;
}

export function daylist(history: Track[], liked: Track[], now = new Date(), journal: JournalEntry[] = []) {
  const slot = Math.floor(now.getHours() / 4);
  const period = ['Late night', 'Early morning', 'Morning', 'Afternoon', 'Evening', 'Night'][slot];
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${slot}`;
  let seed = 0;
  for (const char of key) seed = (seed * 31 + char.charCodeAt(0)) | 0;
  const scores = new Map<string, { track: Track; score: number }>();
  for (const entry of journal) {
    if (entry.heard < 30 || entry.at > now.getTime()) continue;
    const ageDays = (now.getTime() - entry.at) / 86_400_000;
    const date = new Date(entry.at);
    const samePeriod = Math.floor(date.getHours() / 4) === slot;
    const sameDay = date.getDay() === now.getDay();
    const score = Math.pow(0.5, ageDays / 21) * (samePeriod ? 4 : 1) * (sameDay ? 1.5 : 1);
    const row = scores.get(entry.track.id) ?? { track: entry.track, score: 0 };
    row.score += score; scores.set(entry.track.id, row);
  }
  const contextual = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 30).map(row => row.track);
  const tracks = interleave({ contextual, history: history.slice(0, 100), liked }, seed);
  const next = new Date(now);
  next.setHours((slot + 1) * 4, 0, 0, 0);
  return { title: `${period} daylist`, tracks, next };
}

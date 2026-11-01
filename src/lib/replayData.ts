import { usePlayer } from "../stores/player";
import { replayJournal, replaySummary } from "./bridge";
import { journalReplay, type ReplayData, type ReplayPeriod } from "./replay";

const cache = new Map<ReplayPeriod, ReplayData>();

export async function loadReplay(period: ReplayPeriod, now = new Date()): Promise<ReplayData> {
  if (period === "week") return journalReplay(await replayJournal(), now);
  const cached = cache.get(period);
  if (cached) return cached;
  const data = await replaySummary(period);
  cache.set(period, data);
  return data;
}

export function forgetReplayCache(): void {
  cache.clear();
}

export function useListeningNow(): boolean {
  return usePlayer((state) => state.playing && state.queue[state.index] !== undefined && !state.queue[state.index].episode);
}

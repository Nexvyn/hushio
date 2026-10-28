import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";

export const LYRICS_NUDGE_STEP = 0.25;
export const NUDGE_LIMIT_SEC = 10;
export const NUDGE_KEEP = 500;

type NudgeState = {
  nudges: Record<string, number>;
  nudge: (trackId: string, delta: number) => void;
  resetNudge: (trackId: string) => void;
};

export function clampNudge(value: number): number {
  const bounded = Math.min(NUDGE_LIMIT_SEC, Math.max(-NUDGE_LIMIT_SEC, value));
  return Math.round(bounded * 100) / 100;
}

export function describeLyricsShift(nudge: number): string {
  if (nudge === 0) return "In sync";
  return `${Number(Math.abs(nudge).toFixed(2))} s ${nudge > 0 ? "later" : "earlier"}`;
}

export const useLyricsNudge = create<NudgeState>()(
  persist(
    (set) => ({
      nudges: {},
      nudge: (trackId, delta) =>
        set((state) => {
          const { [trackId]: _previous, ...others } = state.nudges;
          const next = clampNudge((state.nudges[trackId] ?? 0) + delta);
          if (next === 0) return { nudges: others };
          const nudges = { ...others, [trackId]: next };
          const keys = Object.keys(nudges);
          for (const key of keys.slice(0, Math.max(0, keys.length - NUDGE_KEEP))) delete nudges[key];
          return { nudges };
        }),
      resetNudge: (trackId) =>
        set((state) => {
          const { [trackId]: _removed, ...others } = state.nudges;
          return { nudges: others };
        }),
    }),
    {
      name: "lyrics-nudges",
      storage: persistStorage<NudgeState>("lyrics-nudges"),
    },
  ),
);

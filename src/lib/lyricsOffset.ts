import { useEffect } from "react";
import { isTyping } from "./shortcuts";
import { LYRICS_NUDGE_STEP, useLyricsNudge } from "../stores/lyricsNudge";
import { useSettings } from "../stores/settings";

export function effectiveLyricsOffset(nudge: number, device: number): number {
  return Math.round((nudge + device) * 100) / 100;
}

export function useLyricsOffset(trackId: string | null): number {
  const nudge = useLyricsNudge((state) => (trackId ? (state.nudges[trackId] ?? 0) : 0));
  const device = useSettings((state) => state.lyricsOffset);
  return effectiveLyricsOffset(nudge, device);
}

export function lyricsKeyStep(code: string): number {
  if (code === "BracketLeft") return -LYRICS_NUDGE_STEP;
  if (code === "BracketRight") return LYRICS_NUDGE_STEP;
  return 0;
}

export function useLyricsTimingKeys(trackId: string | null, enabled = true): void {
  useEffect(() => {
    if (!trackId || !enabled) return;
    const id = trackId;
    function onKeyDown(event: KeyboardEvent) {
      const step = lyricsKeyStep(event.code);
      if (step === 0 || isTyping(event.target)) return;
      event.preventDefault();
      useLyricsNudge.getState().nudge(id, step);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trackId, enabled]);
}

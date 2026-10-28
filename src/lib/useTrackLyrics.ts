import { useEffect, useState } from "react";
import type { LyricsResult } from "./bridge";
import { requestLyrics } from "./lyrics";
import type { Track } from "../types";

export function useTrackLyrics(track: Track | null, duration: number): { lyrics: LyricsResult | null; loading: boolean } {
  const trackId = track?.id ?? null;
  const [settled, setSettled] = useState<{ id: string; lyrics: LyricsResult | null } | null>(null);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    requestLyrics(track, duration).then((result) => {
      if (!cancelled) setSettled({ id: track.id, lyrics: result });
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const ready = settled !== null && settled.id === trackId;
  return {
    lyrics: ready ? settled.lyrics : null,
    loading: trackId !== null && !ready,
  };
}

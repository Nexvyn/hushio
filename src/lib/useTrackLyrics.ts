import { useEffect, useRef, useState } from "react";
import type { LyricsResult } from "./bridge";
import { requestLyrics } from "./lyrics";
import type { Track } from "../types";

export function useTrackLyrics(track: Track | null, duration: number): {
  lyrics: LyricsResult | null;
  loading: boolean;
  reload: () => void;
} {
  const trackId = track?.id ?? null;
  const [settled, setSettled] = useState<{ id: string; lyrics: LyricsResult | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const retry = useRef(false);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    requestLyrics(track, duration, retry.current).then((result) => {
      if (!cancelled) setSettled({ id: track.id, lyrics: result });
    });
    retry.current = false;
    return () => {
      cancelled = true;
    };
  }, [trackId, revision]);

  const ready = settled !== null && settled.id === trackId;
  return {
    lyrics: ready ? settled.lyrics : null,
    loading: trackId !== null && !ready,
    reload: () => {
      retry.current = true;
      setRevision((count) => count + 1);
    },
  };
}

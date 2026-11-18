import { useEffect, useState } from "react";
import { canvasClipFor } from "../lib/canvas";
import { canPlayHlsNatively, lookupCanvasClip } from "../lib/canvasSources";
import { reducedMotion } from "../lib/motion";
import type { Track } from "../types";

type Settled = { id: string; url: string | null };

export function useCanvasClip(track: Track | null | undefined, enabled: boolean): string | null {
  const id = track?.id ?? null;
  const title = track?.title ?? "";
  const artist = track?.artist ?? "";
  const album = track?.album ?? null;
  const duration = track?.duration ?? null;
  const active = enabled && id !== null && !reducedMotion();
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active || id === null) return;
    let live = true;
    const query = { id, title, artist, album, durationSeconds: duration };
    void lookupCanvasClip(query, { canPlayHls: canPlayHlsNatively() }).then((clip) => {
      if (live) setSettled({ id, url: clip?.url ?? null });
    });
    return () => {
      live = false;
    };
  }, [active, id, title, artist, album, duration]);

  if (!active || id === null) return null;
  const cached = canvasClipFor(id);
  if (cached) return cached.url;
  return settled?.id === id ? settled.url : null;
}

import { useEffect, useState } from "react";
import { ambientFor, type AmbientPair } from "../../lib/artworkPalette";

export type SettledPalette = { url: string; pair: AmbientPair };

export function heldPalette(settled: SettledPalette | null, url: string): AmbientPair | null {
  if (!url || settled === null) return null;
  return settled.pair;
}

export function useHeldPalette(url: string): AmbientPair | null {
  const [settled, setSettled] = useState<SettledPalette | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    void ambientFor(url).then((pair) => {
      if (live) setSettled({ url, pair });
    });
    return () => {
      live = false;
    };
  }, [url]);

  return heldPalette(settled, url);
}

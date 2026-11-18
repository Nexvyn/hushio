import { useEffect, useState } from "react";
import { ambientFor, type AmbientPair } from "../../lib/artworkPalette";

export type SettledPalette = { url: string; pair: AmbientPair };

export function heldPalette(settled: SettledPalette | null, url: string): AmbientPair | null {
  if (!url || settled === null) return null;
  return settled.pair;
}

let lastSettled: SettledPalette | null = null;

export function warmPalette(url: string): void {
  if (!url || lastSettled?.url === url) return;
  void ambientFor(url).then((pair) => {
    lastSettled = { url, pair };
  });
}

export function useHeldPalette(url: string): AmbientPair | null {
  const [settled, setSettled] = useState<SettledPalette | null>(() => (lastSettled?.url === url ? lastSettled : null));

  useEffect(() => {
    if (!url) return;
    let live = true;
    void ambientFor(url).then((pair) => {
      lastSettled = { url, pair };
      if (live) setSettled(lastSettled);
    });
    return () => {
      live = false;
    };
  }, [url]);

  return heldPalette(settled, url);
}

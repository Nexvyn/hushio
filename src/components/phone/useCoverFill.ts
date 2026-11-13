import { useEffect, useState } from "react";
import { AMBIENT_FALLBACK, ambientFor, parseRgb } from "../../lib/artworkPalette";
import { flatFillFor } from "../AmbientBackdrop";

function onLightTheme(): boolean {
  const text = getComputedStyle(document.documentElement).getPropertyValue("--on-art").trim();
  return text !== "" && parseRgb(text)[0] < 128;
}

export function useCoverFill(src: string): string | null {
  const [settled, setSettled] = useState<{ fill: string | null } | null>(null);

  useEffect(() => {
    if (!src) {
      setSettled(null);
      return;
    }
    let live = true;
    void ambientFor(src).then((pair) => {
      if (live) setSettled({ fill: pair === AMBIENT_FALLBACK ? null : flatFillFor(pair.primary, onLightTheme()) });
    });
    return () => {
      live = false;
    };
  }, [src]);

  return src && settled ? settled.fill : null;
}

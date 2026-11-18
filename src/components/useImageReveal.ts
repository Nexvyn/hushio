import { useState } from "react";

const revealed = new Set<string>();

export function markRevealed(src: string): void {
  revealed.add(src);
}

export function useImageReveal(src: string | null | undefined) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const shown = !!src && (revealed.has(src) || loaded === src);
  const onLoad = () => {
    if (!src) return;
    revealed.add(src);
    setLoaded(src);
  };
  return { shown, onLoad, className: `${shown ? "opacity-100" : "opacity-0"} motion-safe:transition-opacity motion-safe:duration-reading` };
}

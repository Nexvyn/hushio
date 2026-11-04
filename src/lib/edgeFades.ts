import { useEffect, type RefObject } from "react";

export type EdgeFadeState = { start: boolean; end: boolean };

const EDGE_TOLERANCE_PX = 1;

export function edgeFadeState(position: number, scrollSize: number, viewSize: number): EdgeFadeState {
  const max = scrollSize - viewSize;
  if (max <= EDGE_TOLERANCE_PX) return { start: false, end: false };
  return {
    start: position > EDGE_TOLERANCE_PX,
    end: position < max - EDGE_TOLERANCE_PX,
  };
}

export function useEdgeFades<T extends HTMLElement>(ref: RefObject<T | null>, axis: "x" | "y") {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const horizontal = axis === "x";
    const apply = () => {
      const state = horizontal
        ? edgeFadeState(node.scrollLeft, node.scrollWidth, node.clientWidth)
        : edgeFadeState(node.scrollTop, node.scrollHeight, node.clientHeight);
      node.dataset.fadeStart = String(state.start);
      node.dataset.fadeEnd = String(state.end);
      if (horizontal) node.dataset.fadeX = "";
      else delete node.dataset.fadeX;
    };
    apply();
    node.addEventListener("scroll", apply, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(node);
    return () => {
      node.removeEventListener("scroll", apply);
      observer?.disconnect();
    };
  }, [ref, axis]);
}

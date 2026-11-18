import { useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION_MS, EASE_OUT, reducedMotion } from "./motion";

const ROW_SELECTOR = "[data-row-key]";
const EASE = `cubic-bezier(${EASE_OUT.join(", ")})`;

type Layout = { signature: string; tops: Map<string, number> };

function measureRows(list: HTMLElement): Map<string, number> {
  const tops = new Map<string, number>();
  list.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((row) => {
    tops.set(row.dataset.rowKey ?? "", row.offsetTop);
  });
  return tops;
}

function playRows(list: HTMLElement, before: Map<string, number>, after: Map<string, number>) {
  if (!("animate" in list)) return;
  list.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((row) => {
    const key = row.dataset.rowKey ?? "";
    const to = after.get(key);
    if (to === undefined) return;
    const from = before.get(key);
    if (from === undefined) {
      row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS.fade, easing: EASE });
      return;
    }
    const dy = from - to;
    if (dy === 0) return;
    row.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
      duration: DURATION_MS.swap,
      easing: EASE,
    });
  });
}

export function useFlip(listRef: RefObject<HTMLElement | null>, signature: string, skip: () => boolean = () => false) {
  const previous = useRef<Layout | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    const skipped = skip();
    if (!list) {
      previous.current = null;
      return;
    }
    const tops = measureRows(list);
    const before = previous.current;
    previous.current = { signature, tops };
    if (!before || before.signature === signature || skipped || reducedMotion()) return;
    playRows(list, before.tops, tops);
  });
}

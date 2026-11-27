import { useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION_MS, EASE_IN, EASE_IN_OUT, EASE_OUT, reducedMotion } from "./motion";

const ROW_SELECTOR = "[data-row-key]";

const curve = (points: readonly number[]) => `cubic-bezier(${points.join(", ")})`;
const ENTER = curve(EASE_OUT);
const EXIT = curve(EASE_IN);
const MOVE = curve(EASE_IN_OUT);

type Row = { top: number; rect: DOMRect; element: HTMLElement };
type Layout = { signature: string; rows: Map<string, Row> };

function measureRows(list: HTMLElement): Map<string, Row> {
  const rows = new Map<string, Row>();
  list.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((element) => {
    rows.set(element.dataset.rowKey ?? "", {
      top: element.offsetTop,
      rect: element.getBoundingClientRect(),
      element,
    });
  });
  return rows;
}

function fadeOut(element: HTMLElement, rect: DOMRect) {
  element.removeAttribute("data-row-key");
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("inert", "");
  Object.assign(element.style, {
    position: "fixed",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    right: "auto",
    bottom: "auto",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    transform: "none",
    pointerEvents: "none",
    zIndex: "50",
  });
  document.body.append(element);
  if (typeof element.animate !== "function") {
    element.remove();
    return;
  }
  element
    .animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURATION_MS.reading, easing: EXIT })
    .finished.then(
      () => element.remove(),
      () => element.remove(),
    );
}

function playRows(list: HTMLElement, before: Map<string, Row>, after: Map<string, Row>) {
  if (!("animate" in list)) return;
  list.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach((row) => {
    const key = row.dataset.rowKey ?? "";
    const to = after.get(key)?.top;
    if (to === undefined) return;
    const from = before.get(key)?.top;
    if (from === undefined) {
      row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION_MS.quick, easing: ENTER });
      return;
    }
    const dy = from - to;
    if (dy === 0) return;
    row.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], {
      duration: DURATION_MS.pageIn,
      easing: MOVE,
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
    const rows = measureRows(list);
    const before = previous.current;
    previous.current = { signature, rows };
    if (!before || before.signature === signature || skipped || reducedMotion()) return;
    for (const [key, row] of before.rows) {
      if (!rows.has(key)) fadeOut(row.element, row.rect);
    }
    playRows(list, before.rows, rows);
  });
}

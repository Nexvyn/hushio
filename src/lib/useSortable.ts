import {
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { reducedMotion } from "./motion";
import {
  type Box,
  autoScrollStep,
  clampOffset,
  edgeOverflow,
  LIFT_SHADOW,
  SETTLE_EASE,
  SETTLE_MS,
  START_PX,
  TOUCH_HOLD_MS,
  TOUCH_SLOP_PX,
  shiftFor,
  slotFor,
  spanAt,
} from "./sortable";

const NO_DRAG = "input, select, textarea, [contenteditable], [data-no-drag]";

export type SortableRowProps = {
  "data-row-key": string;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
};

export type SortableOptions = {
  keys: readonly string[];
  listRef: RefObject<HTMLElement | null>;
  onMove?: (from: number, to: number) => void;
  reorder?: boolean;
  canDropOn?: (key: string, targetId: string) => boolean;
  onDropOn?: (key: string, targetId: string, point: { x: number; y: number }) => void;
};

type DropHit = { id: string; element: HTMLElement };

type Drag = {
  key: string;
  from: number;
  signature: string;
  pointerType: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  lifted: boolean;
  rows: HTMLElement[];
  boxes: Box[];
  scroller: HTMLElement | null;
  scrolled: number;
  offset: number;
  target: number;
  drop: DropHit | null;
  holdTimer: number | undefined;
  frame: number;
  detach: () => void;
};

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let element = node?.parentElement ?? null; element; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY;
    if (overflow === "auto" || overflow === "scroll") return element;
  }
  return null;
}

function focusTarget(row: HTMLElement | undefined): HTMLElement | null {
  if (!row) return null;
  return row.matches("button") ? row : row.querySelector<HTMLElement>("button") ?? row;
}

export function useSortable(options: SortableOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const pendingFocus = useRef<string | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const selfMove = useRef(false);

  useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    const list = optionsRef.current.listRef.current;
    const row = Array.from(list?.querySelectorAll<HTMLElement>("[data-row-key]") ?? []).find(
      (element) => element.dataset.rowKey === key,
    );
    focusTarget(row)?.focus();
  });

  useEffect(
    () => () => {
      if (dragRef.current) cancel(dragRef.current);
      window.clearTimeout(settleTimer.current);
    },
    [],
  );

  function signatureOf(keys: readonly string[]): string {
    return keys.join("\n");
  }

  function findDrop(drag: Drag): DropHit | null {
    if (typeof document.elementFromPoint !== "function") return null;
    const element = document.elementFromPoint(drag.x, drag.y)?.closest<HTMLElement>("[data-drop-target]");
    const id = element?.dataset.dropTarget;
    if (!element || !id || !optionsRef.current.canDropOn?.(drag.key, id)) return null;
    return { id, element };
  }

  function paint(drag: Drag) {
    const reduced = reducedMotion();
    const span = spanAt(drag.from, drag.boxes);
    drag.rows.forEach((row, index) => {
      if (index === drag.from) {
        row.style.transition = "none";
        row.style.transform = `translateY(${drag.offset}px) scale(1.02)`;
        row.style.boxShadow = LIFT_SHADOW;
        row.style.background = "rgb(var(--elevated))";
        row.style.position = "relative";
        row.style.zIndex = "10";
        return;
      }
      row.style.transition = reduced ? "none" : `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
      row.style.transform = `translateY(${shiftFor(index, drag.from, drag.target, span)}px)`;
    });
  }

  function update(drag: Drag) {
    const layout = drag.y - drag.startY + drag.scrolled;
    const drop = findDrop(drag);
    if (drop?.element !== drag.drop?.element) {
      if (drag.drop) delete drag.drop.element.dataset.dropHover;
      if (drop) drop.element.dataset.dropHover = "true";
    }
    drag.drop = drop;
    const reorder = optionsRef.current.reorder !== false;
    drag.target = drop || !reorder || Math.abs(layout) < START_PX ? drag.from : slotFor(drag.from, drag.boxes, layout);
    drag.offset = clampOffset(layout, drag.boxes, drag.from);
    paint(drag);
  }

  function autoScroll(drag: Drag) {
    const scroller = drag.scroller;
    if (!scroller || !drag.lifted) return;
    const rect = scroller.getBoundingClientRect();
    const step = autoScrollStep(edgeOverflow(drag.y, rect.top, rect.bottom));
    if (step !== 0) {
      const before = scroller.scrollTop;
      scroller.scrollTop = before + step;
      const moved = scroller.scrollTop - before;
      if (moved !== 0) {
        drag.scrolled += moved;
        update(drag);
      }
    }
    if (typeof requestAnimationFrame === "function") {
      drag.frame = requestAnimationFrame(() => autoScroll(drag));
    }
  }

  function lift(drag: Drag): boolean {
    const { keys, listRef } = optionsRef.current;
    const elements = new Map<string, HTMLElement>();
    listRef.current?.querySelectorAll<HTMLElement>("[data-row-key]").forEach((element) => {
      elements.set(element.dataset.rowKey ?? "", element);
    });
    const rows = keys.map((key) => elements.get(key));
    if (rows.some((row) => row === undefined)) return false;

    drag.rows = rows as HTMLElement[];
    drag.boxes = drag.rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return { top: rect.top, height: rect.height };
    });
    drag.scroller = scrollParent(listRef.current);
    drag.lifted = true;
    document.body.style.userSelect = "none";
    update(drag);
    autoScroll(drag);
    return true;
  }

  function clear(drag: Drag) {
    for (const row of drag.rows) {
      row.style.transition = "";
      row.style.transform = "";
      row.style.boxShadow = "";
      row.style.background = "";
      row.style.position = "";
      row.style.zIndex = "";
    }
    if (drag.drop) delete drag.drop.element.dataset.dropHover;
    drag.drop = null;
    document.body.style.userSelect = "";
  }

  function cancel(drag: Drag) {
    if (drag.lifted) clear(drag);
    drag.detach();
    if (dragRef.current === drag) dragRef.current = null;
  }

  function handleMove(drag: Drag, event: PointerEvent) {
    if (dragRef.current !== drag) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.lifted) {
      if (drag.pointerType === "touch") {
        if (distance > TOUCH_SLOP_PX) cancel(drag);
        return;
      }
      if (distance < START_PX) return;
      if (!lift(drag)) cancel(drag);
      return;
    }
    if (signatureOf(optionsRef.current.keys) !== drag.signature) {
      cancel(drag);
      return;
    }
    update(drag);
  }

  function handleUp(drag: Drag) {
    if (dragRef.current !== drag) return;
    dragRef.current = null;
    drag.detach();
    if (!drag.lifted) return;

    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 250);

    if (drag.drop) {
      const { key, drop, x, y } = drag;
      clear(drag);
      optionsRef.current.onDropOn?.(key, drop.id, { x, y });
      return;
    }
    const { from, target } = drag;
    if (target === from) {
      clear(drag);
      return;
    }
    const reduced = reducedMotion();
    const row = drag.rows[from];
    row.style.transition = reduced ? "none" : `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
    row.style.transform = `translateY(${drag.boxes[target].top - drag.boxes[from].top}px)`;
    settleTimer.current = window.setTimeout(
      () => {
        settleTimer.current = undefined;
        clear(drag);
        selfMove.current = true;
        optionsRef.current.onMove?.(from, target);
      },
      reduced ? 0 : SETTLE_MS,
    );
  }

  function begin(key: string, from: number, event: ReactPointerEvent<HTMLElement>) {
    const drag: Drag = {
      key,
      from,
      signature: signatureOf(optionsRef.current.keys),
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      lifted: false,
      rows: [],
      boxes: [],
      scroller: null,
      scrolled: 0,
      offset: 0,
      target: from,
      drop: null,
      holdTimer: undefined,
      frame: 0,
      detach: () => {},
    };

    const onMove = (moveEvent: PointerEvent) => handleMove(drag, moveEvent);
    const onUp = () => handleUp(drag);
    const onCancel = () => cancel(drag);
    const onKey = (keyEvent: KeyboardEvent) => {
      if (!drag.lifted || keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancel(drag);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onKey, true);
    drag.detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(drag.holdTimer);
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(drag.frame);
    };
    dragRef.current = drag;

    if (event.pointerType === "touch") {
      drag.holdTimer = window.setTimeout(() => {
        if (dragRef.current !== drag || drag.lifted) return;
        if (!lift(drag)) cancel(drag);
      }, TOUCH_HOLD_MS);
    }
  }

  function handlePointerDown(key: string, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || dragRef.current) return;
    const from = optionsRef.current.keys.indexOf(key);
    if (from < 0) return;
    const blocked = (event.target as Element).closest?.(NO_DRAG);
    if (blocked && event.currentTarget.contains(blocked)) return;
    begin(key, from, event);
  }

  function handleKeyDown(key: string, event: ReactKeyboardEvent<HTMLElement>) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    const { keys, onMove, reorder } = optionsRef.current;
    const from = keys.indexOf(key);
    if (from < 0 || reorder === false) return;
    event.preventDefault();
    event.stopPropagation();
    const to = Math.min(keys.length - 1, Math.max(0, from + (event.key === "ArrowUp" ? -1 : 1)));
    if (to === from) return;
    pendingFocus.current = key;
    onMove?.(from, to);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLElement>) {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function consumeSelfMove(): boolean {
    const busy = selfMove.current || dragRef.current !== null;
    selfMove.current = false;
    return busy;
  }

  return {
    consumeSelfMove,
    bind: (key: string): SortableRowProps => ({
      "data-row-key": key,
      onPointerDown: (event) => handlePointerDown(key, event),
      onKeyDown: (event) => handleKeyDown(key, event),
    }),
    listProps: { onClickCapture: handleClickCapture },
  };
}

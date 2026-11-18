import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { rowWindow, usesWindowing, type RowWindow } from "../lib/virtualWindow";

type VirtualListProps<T> = {
  label: string;
  items: readonly T[];
  rowHeight: number;
  getKey: (item: T, index: number) => string;
  renderRow: (item: T, index: number) => ReactNode;
};

export function scrollerOf(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

function measure(list: HTMLElement, count: number, rowHeight: number): RowWindow {
  const scroller = scrollerOf(list);
  const frameTop = scroller ? scroller.getBoundingClientRect().top : 0;
  const viewport = scroller ? scroller.clientHeight : window.innerHeight;
  const offset = frameTop - list.getBoundingClientRect().top;
  return rowWindow({ count, rowHeight, offset, viewport });
}

export function VirtualList<T>({ label, items, rowHeight, getKey, renderRow }: VirtualListProps<T>) {
  const ref = useRef<HTMLUListElement>(null);
  const windowed = usesWindowing(items.length);
  const [range, setRange] = useState<RowWindow>(() =>
    rowWindow({ count: items.length, rowHeight, offset: 0, viewport: window.innerHeight }),
  );

  useLayoutEffect(() => {
    const list = ref.current;
    if (!windowed || !list) return;
    const scroller = scrollerOf(list);
    const update = () => {
      const next = measure(list, items.length, rowHeight);
      setRange((current) =>
        current.start === next.start && current.end === next.end ? current : next,
      );
    };
    update();
    const target: EventTarget = scroller ?? window;
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [windowed, items.length, rowHeight]);

  if (!windowed) {
    return (
      <ul aria-label={label} className="m-0 list-none p-0">
        {items.map((item, index) => (
          <li key={getKey(item, index)} style={{ height: rowHeight }}>
            {renderRow(item, index)}
          </li>
        ))}
      </ul>
    );
  }

  const visible = items.slice(range.start, range.end);
  return (
    <ul
      aria-label={label}
      ref={ref}
      className="relative m-0 list-none p-0"
      style={{ height: items.length * rowHeight }}
    >
      {visible.map((item, offset) => {
        const index = range.start + offset;
        return (
          <li
            key={getKey(item, index)}
            className="absolute inset-x-0"
            style={{ top: index * rowHeight, height: rowHeight }}
          >
            {renderRow(item, index)}
          </li>
        );
      })}
    </ul>
  );
}

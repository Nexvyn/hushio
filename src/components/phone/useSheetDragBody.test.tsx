import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { MotionValue } from "motion/react";
import { sheetBodyAtTop, useSheetDrag, type DragStart } from "./useSheetDrag";

function Probe({ mode, onClose, track }: { mode: DragStart | null; onClose: () => void; track: { y?: MotionValue<number> } }) {
  const drag = useSheetDrag(onClose, () => mode);
  track.y = drag.y;
  return (
    <div data-testid="sheet" {...drag.handlers}>
      <span>Body</span>
    </div>
  );
}

function setup(mode: DragStart | null, onClose = () => {}) {
  const track: { y?: MotionValue<number> } = {};
  const view = render(<Probe mode={mode} onClose={onClose} track={track} />);
  if (!track.y) throw new Error("probe did not expose y");
  track.y.set(0);
  return { sheet: view.getByTestId("sheet"), offset: () => track.y?.get() ?? NaN };
}

const hadPointerEvent = "PointerEvent" in window;
const originalPointerEvent = (window as { PointerEvent?: unknown }).PointerEvent;

beforeAll(() => {
  if (!hadPointerEvent) Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true, writable: true });
});

afterAll(() => {
  if (hadPointerEvent) Object.defineProperty(window, "PointerEvent", { value: originalPointerEvent, configurable: true, writable: true });
  else delete (window as { PointerEvent?: unknown }).PointerEvent;
});

afterEach(() => cleanup());

describe("content drag on a sheet body", () => {
  it("ignores an upward drag from the body", () => {
    const { sheet, offset } = setup("content");
    fireEvent.pointerDown(sheet, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet, { clientX: 100, clientY: 60 });
    fireEvent.pointerMove(sheet, { clientX: 100, clientY: 40 });
    fireEvent.pointerUp(sheet, { clientX: 100, clientY: 40 });
    expect(offset()).toBe(0);
  });

  it("follows a downward pull from the body from the first pixel", () => {
    const { sheet, offset } = setup("content");
    fireEvent.pointerDown(sheet, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet, { clientX: 100, clientY: 140 });
    expect(offset()).toBeCloseTo(40);
    fireEvent.pointerMove(sheet, { clientX: 100, clientY: 180 });
    expect(offset()).toBeCloseTo(80);
  });

  it("does not close on a tap in the body", () => {
    const onClose = vi.fn();
    const { sheet } = setup("content", onClose);
    fireEvent.pointerDown(sheet, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(sheet, { clientX: 100, clientY: 101 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not start a drag when the start is refused", () => {
    const { sheet, offset } = setup(null);
    fireEvent.pointerDown(sheet, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet, { clientX: 100, clientY: 160 });
    expect(offset()).toBe(0);
  });
});

describe("sheetBodyAtTop", () => {
  function scroller(scrollTop: number, overflows: boolean) {
    const node = document.createElement("div");
    Object.defineProperty(node, "scrollTop", { value: scrollTop, configurable: true });
    Object.defineProperty(node, "scrollHeight", { value: overflows ? 500 : 100, configurable: true });
    Object.defineProperty(node, "clientHeight", { value: 100, configurable: true });
    return node;
  }

  it("is true when the body and every scrolling ancestor are at the top", () => {
    const root = scroller(0, true);
    const child = document.createElement("p");
    root.appendChild(child);
    expect(sheetBodyAtTop(child, root)).toBe(true);
  });

  it("is false when the body is scrolled down", () => {
    const root = scroller(30, true);
    const child = document.createElement("p");
    root.appendChild(child);
    expect(sheetBodyAtTop(child, root)).toBe(false);
  });

  it("is false when a nested list inside the body is scrolled down", () => {
    const root = scroller(0, true);
    const inner = scroller(12, true);
    const child = document.createElement("p");
    inner.appendChild(child);
    root.appendChild(inner);
    expect(sheetBodyAtTop(child, root)).toBe(false);
  });
});

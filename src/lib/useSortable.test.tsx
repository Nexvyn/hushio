import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { moveKey } from "./libraryOrder";
import { useSortable } from "./useSortable";

function pointer(target: Element | Window, type: string, at: { x: number; y: number; pointerType?: string }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, button: 0 });
  Object.defineProperty(event, "pointerType", { value: at.pointerType ?? "mouse" });
  target.dispatchEvent(event);
}

function rowOf(id: string): HTMLElement {
  return document.querySelector(`[data-row-key="${id}"]`) as HTMLElement;
}

function order(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-row-key]")).map((row) => row.dataset.rowKey ?? "");
}

function mockElementFromPoint(element: Element | null) {
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });
}

type HarnessProps = {
  initial: string[];
  onMove?: (from: number, to: number) => void;
  onDropOn?: (key: string, targetId: string) => void;
  onClick?: (id: string) => void;
};

function Harness({ initial, onMove, onDropOn, onClick, reorder }: HarnessProps & { reorder?: boolean }) {
  const [ids, setIds] = useState(initial);
  const listRef = useRef<HTMLUListElement>(null);
  const sortable = useSortable({
    keys: ids,
    listRef,
    reorder,
    onMove: (from, to) => {
      onMove?.(from, to);
      setIds((current) => moveKey(current, from, to));
    },
    canDropOn: (key, targetId) => key.startsWith("a") && targetId.startsWith("folder:"),
    onDropOn,
  });
  return (
    <>
      <ul ref={listRef} {...sortable.listProps}>
        {ids.map((id) => (
          <li key={id} {...sortable.bind(id)}>
            <button type="button" onClick={() => onClick?.(id)}>
              {id}
            </button>
            <span data-no-drag>
              <button type="button">menu {id}</button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" data-drop-target="folder:1">
        Folder
      </button>
    </>
  );
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const index = Array.from(document.querySelectorAll("[data-row-key]")).indexOf(this);
    const top = index < 0 ? 0 : index * 60;
    return { top, bottom: top + 50, height: 50, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("reduce-motion");
  document.body.style.userSelect = "";
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("pointer reorder", () => {
  it("ignores a press that moves less than 5 px", () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 28 });
    pointer(window, "pointerup", { x: 0, y: 28 });

    expect(onMove).not.toHaveBeenCalled();
    expect(rowOf("a").style.transform).toBe("");
  });

  it("lifts the row, shifts the row it passes, and commits the new slot on release", async () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    expect(rowOf("a").style.transform).toBe("translateY(70px) scale(1.02)");
    expect(rowOf("b").style.transform).toBe("translateY(-60px)");
    expect(rowOf("c").style.transform).toBe("translateY(0px)");

    pointer(window, "pointerup", { x: 0, y: 95 });
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(0, 1));
    await waitFor(() => expect(order()).toEqual(["b", "a", "c"]));
    expect(rowOf("a").style.transform).toBe("");
  });

  it("drops the row back when the pointer ends in its own slot", () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 40 });
    pointer(window, "pointerup", { x: 0, y: 40 });

    expect(onMove).not.toHaveBeenCalled();
    expect(rowOf("a").style.transform).toBe("");
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("cancels a lifted drag on Escape without committing", () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    fireEvent.keyDown(window, { key: "Escape" });
    pointer(window, "pointerup", { x: 0, y: 95 });

    expect(onMove).not.toHaveBeenCalled();
    expect(rowOf("a").style.transform).toBe("");
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("settles without a delay and without transitions when Reduce Motion is on", async () => {
    document.documentElement.classList.add("reduce-motion");
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    expect(rowOf("b").style.transition).toBe("none");
    pointer(window, "pointerup", { x: 0, y: 95 });

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(0, 1));
  });

  it("does not start a drag from a control marked data-no-drag", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    const menu = screen.getByRole("button", { name: "menu a" });

    pointer(menu, "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });

    expect(rowOf("a").style.transform).toBe("");
  });

  it("swallows the click that follows a drag, but not later clicks", () => {
    const onClick = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "a" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    pointer(window, "pointerup", { x: 0, y: 95 });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("starts a touch drag only after the 400 ms hold", async () => {
    render(<Harness initial={["a", "b", "c"]} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25, pointerType: "touch" });
    await new Promise((resolve) => setTimeout(resolve, 430));
    expect(rowOf("a").style.transform).toContain("scale(1.02)");
    pointer(window, "pointerup", { x: 0, y: 25 });
  });

  it("lets a touch that moves before the hold scroll instead of dragging", async () => {
    render(<Harness initial={["a", "b", "c"]} />);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25, pointerType: "touch" });
    pointer(window, "pointermove", { x: 0, y: 55 });
    await new Promise((resolve) => setTimeout(resolve, 430));

    expect(rowOf("a").style.transform).toBe("");
  });
});

describe("drop-only lists", () => {
  it("lifts a row onto a target without shifting the rows around it", () => {
    const onMove = vi.fn();
    const onDropOn = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} onDropOn={onDropOn} reorder={false} />);
    const target = screen.getByRole("button", { name: "Folder" });
    mockElementFromPoint(target);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    expect(rowOf("b").style.transform).toBe("translateY(0px)");
    pointer(window, "pointerup", { x: 0, y: 95 });

    expect(onDropOn).toHaveBeenCalledWith("a", "folder:1", expect.any(Object));
    expect(onMove).not.toHaveBeenCalled();
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("ignores Alt+Arrow when reordering is off", () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} reorder={false} />);
    fireEvent.keyDown(rowOf("a"), { key: "ArrowDown", altKey: true });
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("drop targets", () => {
  it("highlights the target under the pointer and calls onDropOn instead of reordering", () => {
    const onMove = vi.fn();
    const onDropOn = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} onDropOn={onDropOn} />);
    const target = screen.getByRole("button", { name: "Folder" });
    mockElementFromPoint(target);

    pointer(rowOf("a"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    expect(target.dataset.dropHover).toBe("true");
    expect(rowOf("b").style.transform).toBe("translateY(0px)");

    pointer(window, "pointerup", { x: 0, y: 95 });

    expect(onDropOn).toHaveBeenCalledWith("a", "folder:1", expect.objectContaining({ y: 95 }));
    expect(onMove).not.toHaveBeenCalled();
    expect(target.dataset.dropHover).toBeUndefined();
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("ignores a drop target the hook is not allowed to use", () => {
    const onDropOn = vi.fn();
    render(<Harness initial={["b", "c"]} onDropOn={onDropOn} />);
    const target = screen.getByRole("button", { name: "Folder" });
    mockElementFromPoint(target);

    pointer(rowOf("b"), "pointerdown", { x: 0, y: 25 });
    pointer(window, "pointermove", { x: 0, y: 95 });
    pointer(window, "pointerup", { x: 0, y: 95 });

    expect(onDropOn).not.toHaveBeenCalled();
  });
});

describe("keyboard reorder", () => {
  it("moves the focused row with Alt+ArrowDown and keeps focus on it", () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);
    const button = screen.getByRole("button", { name: "a" });
    button.focus();

    fireEvent.keyDown(button, { key: "ArrowDown", altKey: true });

    expect(onMove).toHaveBeenCalledWith(0, 1);
    expect(order()).toEqual(["b", "a", "c"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "a" }));
  });

  it("does nothing at the end of the list and ignores arrows without Alt", () => {
    const onMove = vi.fn();
    render(<Harness initial={["a", "b", "c"]} onMove={onMove} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "c" }), { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "a" }), { key: "ArrowDown" });

    expect(onMove).not.toHaveBeenCalled();
    expect(order()).toEqual(["a", "b", "c"]);
  });
});

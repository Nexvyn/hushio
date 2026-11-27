import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { animate } from "motion/react";
import { SPRING_GESTURE } from "../../lib/motion";
import { stretchScale } from "./overscrollStretch";
import { useOverscrollStretch } from "./useOverscrollStretch";

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    animate: vi.fn((value: { set: (v: number) => void }, to: number) => {
      value.set(to);
      return { stop: () => {} };
    }),
  };
});

const EDGES_BOTH = { top: true, bottom: true };

let scroller: HTMLElement;
let content: HTMLElement;

function setMetrics(scrollTop: number) {
  Object.defineProperty(scroller, "scrollTop", { configurable: true, value: scrollTop, writable: true });
  Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
}

function touch(type: string, y: number, x = 0, target: HTMLElement = scroller) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }],
  });
  target.dispatchEvent(event);
  return event;
}

function mount(scrollTop: number, edges = EDGES_BOTH) {
  setMetrics(scrollTop);
  renderHook(() => useOverscrollStretch("view-scroll", edges));
}

beforeEach(() => {
  vi.mocked(animate).mockClear();
  document.body.innerHTML = '<div id="view-scroll"><div class="inner"></div></div>';
  scroller = document.getElementById("view-scroll") as HTMLElement;
  content = scroller.firstElementChild as HTMLElement;
});

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

describe("useOverscrollStretch", () => {
  it("stretches the content from the bottom edge, anchored at the bottom", () => {
    mount(600);
    touch("touchstart", 500);
    touch("touchmove", 450);
    expect(content.style.transformOrigin).toBe("bottom");
    expect(content.style.transform).toBe(`scaleY(${stretchScale(50)})`);
  });

  it("stretches the top edge anchored at the top", () => {
    mount(0);
    touch("touchstart", 100);
    touch("touchmove", 160);
    expect(content.style.transformOrigin).toBe("top");
    expect(content.style.transform).toBe(`scaleY(${stretchScale(60)})`);
  });

  it("does not stretch past the top when the top edge is disabled (Home)", () => {
    mount(0, { top: false, bottom: true });
    touch("touchstart", 100);
    touch("touchmove", 160);
    expect(content.style.transform).toBe("");
    expect(animate).not.toHaveBeenCalled();
  });

  it("does not stretch mid-list", () => {
    mount(300);
    touch("touchstart", 500);
    touch("touchmove", 450);
    expect(content.style.transform).toBe("");
  });

  it("releases to scale 1 with the gesture spring on touchend", () => {
    mount(600);
    touch("touchstart", 500);
    touch("touchmove", 450);
    touch("touchend", 450);
    expect(animate).toHaveBeenLastCalledWith(expect.anything(), 1, SPRING_GESTURE);
    expect(content.style.transform).toBe("");
  });

  it("releases on touchcancel too", () => {
    mount(0);
    touch("touchstart", 100);
    touch("touchmove", 160);
    touch("touchcancel", 160);
    expect(content.style.transform).toBe("");
  });

  it("reduces the stretch when the finger reverses before scrolling resumes", () => {
    mount(600);
    touch("touchstart", 500);
    touch("touchmove", 450);
    touch("touchmove", 470);
    expect(content.style.transform).toBe(`scaleY(${stretchScale(30)})`);
    const reversed = touch("touchmove", 500);
    expect(content.style.transform).toBe("");
    expect(reversed.defaultPrevented).toBe(true);
  });

  it("ignores a mostly horizontal drag", () => {
    mount(600);
    touch("touchstart", 500, 100);
    touch("touchmove", 470, 200);
    expect(content.style.transform).toBe("");
  });

  it("does nothing under reduced motion", () => {
    document.documentElement.classList.add("reduce-motion");
    mount(600);
    touch("touchstart", 500);
    touch("touchmove", 450);
    expect(content.style.transform).toBe("");
    expect(animate).not.toHaveBeenCalled();
  });

  it("skips gestures that start inside data-no-stretch", () => {
    mount(600);
    const marked = document.createElement("div");
    marked.setAttribute("data-no-stretch", "");
    content.appendChild(marked);
    touch("touchstart", 500, 0, marked);
    touch("touchmove", 450);
    expect(content.style.transform).toBe("");
  });
});

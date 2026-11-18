import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { useEdgeBack } from "./useEdgeBack";

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

function touchMove(): Event {
  const event = new Event("touchmove", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("edge back touch handling", () => {
  it("prevents the default of a touchmove during a sideways edge swipe", () => {
    renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    fireEvent.pointerDown(window, { clientX: 30, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 90, clientY: 302 });
    expect(touchMove().defaultPrevented).toBe(true);
  });

  it("leaves a touchmove alone outside an edge session", () => {
    renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    expect(touchMove().defaultPrevented).toBe(false);
  });

  it("leaves a touchmove alone when the edge swipe turns vertical", () => {
    renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    fireEvent.pointerDown(window, { clientX: 30, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 32, clientY: 380 });
    expect(touchMove().defaultPrevented).toBe(false);
  });
});

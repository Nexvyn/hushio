import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { listenBackGesture, type BackGestureHandlers } from "../../lib/bridge";
import { useEdgeBack } from "./useEdgeBack";

vi.mock("../../lib/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/bridge")>();
  return { ...actual, platform: "android", listenBackGesture: vi.fn() };
});

let handlers: BackGestureHandlers | null = null;
const stopGesture = vi.fn();

beforeEach(() => {
  handlers = null;
  stopGesture.mockClear();
  vi.mocked(listenBackGesture).mockClear();
  vi.mocked(listenBackGesture).mockImplementation(async (next) => {
    handlers = next;
    return stopGesture;
  });
});

function gesture(): BackGestureHandlers {
  if (!handlers) throw new Error("gesture listener not registered");
  return handlers;
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

describe("android predictive back", () => {
  afterEach(() => document.documentElement.classList.remove("reduce-motion"));

  it("moves, scales and rounds the screen with the gesture progress", async () => {
    const { result } = renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    act(() => gesture().onProgress(0.5, "left"));
    await waitFor(() => expect(result.current.x.get()).toBeCloseTo(14));
    expect(result.current.scale.get()).toBeCloseTo(0.96);
    expect(result.current.radius.get()).toBeCloseTo(12);
    expect(result.current.shade.get()).toBeCloseTo(0.04);
  });

  it("moves the screen toward the left when the gesture starts on the right edge", async () => {
    const { result } = renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    act(() => gesture().onProgress(1, "right"));
    await waitFor(() => expect(result.current.x.get()).toBeCloseTo(-28));
    expect(result.current.radius.get()).toBeCloseTo(24);
  });

  it("settles back to rest after a cancelled gesture", async () => {
    const { result } = renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    act(() => gesture().onProgress(0.8, "left"));
    act(() => gesture().onCancel());
    await waitFor(() => expect(result.current.scale.get()).toBe(1));
    expect(result.current.x.get()).toBe(0);
  });

  it("does not call onBack on commit, the press event does that", () => {
    const onBack = vi.fn();
    renderHook(() => useEdgeBack({ enabled: true, onBack }));
    act(() => gesture().onProgress(0.9, "left"));
    act(() => gesture().onCommit());
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps the screen still under Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const { result } = renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    act(() => gesture().onProgress(0.7, "left"));
    expect(result.current.x.get()).toBe(0);
    expect(result.current.scale.get()).toBe(1);
  });

  it("unregisters the gesture listener on unmount", async () => {
    const { unmount } = renderHook(() => useEdgeBack({ enabled: true, onBack: vi.fn() }));
    await waitFor(() => expect(handlers).not.toBeNull());
    unmount();
    await waitFor(() => expect(stopGesture).toHaveBeenCalled());
  });

  it("does not listen when the edge back is disabled", () => {
    renderHook(() => useEdgeBack({ enabled: false, onBack: vi.fn() }));
    expect(listenBackGesture).not.toHaveBeenCalled();
  });
});

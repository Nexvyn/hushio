import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { COUNT_UP_MS, countUpValue, useCountUp } from "./countUp";

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("countUpValue", () => {
  it("starts at zero, ends on the target and eases out in between", () => {
    expect(countUpValue(100, 0)).toBe(0);
    expect(countUpValue(100, COUNT_UP_MS)).toBe(100);
    expect(countUpValue(100, COUNT_UP_MS * 2)).toBe(100);
    expect(countUpValue(100, COUNT_UP_MS / 2)).toBe(94);
  });
});

describe("useCountUp", () => {
  it("shows the final value at once under reduced motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    const { result } = renderHook(() => useCountUp(1204));
    expect(result.current).toBe(1204);
    expect(frames).toHaveLength(0);
  });

  it("counts up frame by frame when motion is allowed", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { result } = renderHook(() => useCountUp(100));
    expect(result.current).toBe(0);

    act(() => frames.shift()?.(COUNT_UP_MS / 2));
    expect(result.current).toBe(94);

    act(() => frames.shift()?.(COUNT_UP_MS));
    expect(result.current).toBe(100);
    expect(frames).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useImageReveal } from "./useImageReveal";

describe("useImageReveal", () => {
  it("keeps an uncached image hidden until it loads", () => {
    const { result } = renderHook(() => useImageReveal("https://img.test/fresh-a.jpg"));
    expect(result.current.shown).toBe(false);
    expect(result.current.className).toContain("opacity-0");

    act(() => result.current.onLoad());
    expect(result.current.shown).toBe(true);
    expect(result.current.className).toContain("opacity-100");
  });

  it("shows an already loaded image at once", () => {
    const src = "https://img.test/fresh-b.jpg";
    const first = renderHook(() => useImageReveal(src));
    act(() => first.result.current.onLoad());
    first.unmount();

    const again = renderHook(() => useImageReveal(src));
    expect(again.result.current.shown).toBe(true);
  });

  it("never shows a missing source", () => {
    const { result } = renderHook(() => useImageReveal(null));
    expect(result.current.shown).toBe(false);
  });
});

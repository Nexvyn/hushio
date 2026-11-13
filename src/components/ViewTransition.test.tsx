import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ViewTransition } from "./ViewTransition";
import { DURATION_MS } from "../lib/motion";

function page(label: string) {
  return <p>{label}</p>;
}

function wrapperOf(text: string): HTMLElement | null {
  return screen.queryByText(text)?.parentElement ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

describe("ViewTransition", () => {
  it("fades the incoming view in and the outgoing view out, then drops the outgoing one", () => {
    const { rerender } = render(<ViewTransition routeKey="a">{page("A")}</ViewTransition>);
    rerender(<ViewTransition routeKey="b">{page("B")}</ViewTransition>);
    expect(wrapperOf("A")?.classList.contains("bt-page-out")).toBe(true);
    expect(wrapperOf("B")?.classList.contains("bt-page-in")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(DURATION_MS.pageOut + 1);
    });
    expect(screen.queryByText("A")).toBeNull();
    expect(wrapperOf("B")?.classList.contains("bt-page-in")).toBe(true);
  });

  it("retargets when navigating again mid transition and never queues", () => {
    const { rerender } = render(<ViewTransition routeKey="a">{page("A")}</ViewTransition>);
    rerender(<ViewTransition routeKey="b">{page("B")}</ViewTransition>);
    act(() => {
      vi.advanceTimersByTime(40);
    });
    rerender(<ViewTransition routeKey="c">{page("C")}</ViewTransition>);
    expect(screen.queryByText("A")).toBeNull();
    expect(wrapperOf("B")?.classList.contains("bt-page-out")).toBe(true);
    expect(wrapperOf("C")?.classList.contains("bt-page-in")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(DURATION_MS.pageOut + 1);
    });
    expect(screen.queryByText("B")).toBeNull();
    expect(screen.getByText("C")).toBeTruthy();
  });

  it("uses no animation classes under Reduce Motion and removes the old view at once", () => {
    document.documentElement.classList.add("reduce-motion");
    const { container, rerender } = render(<ViewTransition routeKey="a">{page("A")}</ViewTransition>);
    rerender(<ViewTransition routeKey="b">{page("B")}</ViewTransition>);
    expect(screen.queryByText("A")).toBeNull();
    expect(container.querySelector(".bt-page-in, .bt-page-out")).toBeNull();
  });
});

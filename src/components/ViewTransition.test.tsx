import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ViewTransition } from "./ViewTransition";

function page(label: string) {
  return <p>{label}</p>;
}

function wrapperOf(text: string): HTMLElement | null {
  return screen.queryByText(text)?.parentElement ?? null;
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

describe("ViewTransition", () => {
  it("mounts only the incoming view with a page-in class and keeps no outgoing copy", () => {
    const { container, rerender } = render(<ViewTransition routeKey="a">{page("A")}</ViewTransition>);
    rerender(<ViewTransition routeKey="b">{page("B")}</ViewTransition>);
    expect(screen.queryByText("A")).toBeNull();
    expect(wrapperOf("B")?.classList.contains("bt-page-in")).toBe(true);
    expect(container.querySelector(".bt-page-out")).toBeNull();
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("remounts on every navigation, including one made mid-transition", () => {
    const { rerender } = render(<ViewTransition routeKey="a">{page("A")}</ViewTransition>);
    rerender(<ViewTransition routeKey="b">{page("B")}</ViewTransition>);
    rerender(<ViewTransition routeKey="c">{page("C")}</ViewTransition>);
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.queryByText("B")).toBeNull();
    expect(wrapperOf("C")?.classList.contains("bt-page-in")).toBe(true);
  });

  it("uses no animation classes under Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const { container, rerender } = render(<ViewTransition routeKey="a">{page("A")}</ViewTransition>);
    rerender(<ViewTransition routeKey="b">{page("B")}</ViewTransition>);
    expect(screen.queryByText("A")).toBeNull();
    expect(container.querySelector(".bt-page-in, .bt-page-out")).toBeNull();
  });
});

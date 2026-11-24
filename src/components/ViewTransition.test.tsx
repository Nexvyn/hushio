import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ViewTransition } from "./ViewTransition";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

describe("ViewTransition", () => {
  it("uses route direction for push and pop transitions", () => {
    const { rerender, container } = render(<ViewTransition routeKey="a" direction="push"><p>A</p></ViewTransition>);
    rerender(<ViewTransition routeKey="b" direction="pop"><p>B</p></ViewTransition>);
    expect(screen.getByText("B")).toBeTruthy();
    expect(container.querySelector('[data-route-transition="pop"]')).toBeTruthy();
  });

  it("crossfades tabs without a travel direction", () => {
    const { container } = render(<ViewTransition routeKey="tab" direction="tab"><p>Tab</p></ViewTransition>);
    expect(container.querySelector('[data-route-transition="tab"]')).toBeTruthy();
  });

  it("keeps a fade path under Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const { rerender, container } = render(<ViewTransition routeKey="a" direction="push"><p>A</p></ViewTransition>);
    rerender(<ViewTransition routeKey="b" direction="pop"><p>B</p></ViewTransition>);
    expect(screen.getByText("B")).toBeTruthy();
    expect(container.querySelector('[data-route-transition="pop"]')).toBeTruthy();
  });
});

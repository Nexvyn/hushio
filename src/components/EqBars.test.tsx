import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EqBars } from "./EqBars";

afterEach(cleanup);

describe("EqBars", () => {
  it("animates three bars while the row is playing", () => {
    render(<EqBars playing />);
    const indicator = screen.getByRole("img", { name: "Playing" });
    const bars = indicator.querySelectorAll("span");
    expect(bars).toHaveLength(3);
    for (const bar of bars) expect(bar.classList.contains("bt-eq")).toBe(true);
  });

  it("stops the bars when the row is paused", () => {
    render(<EqBars playing={false} />);
    const bars = screen.getByRole("img", { name: "Playing" }).querySelectorAll("span");
    for (const bar of bars) expect(bar.classList.contains("bt-eq")).toBe(false);
  });

  it("staggers the bars with a calc of the token, not a literal time", () => {
    render(<EqBars playing />);
    const bars = screen.getByRole("img", { name: "Playing" }).querySelectorAll("span");
    expect(bars[1].style.animationDelay).toBe("calc(var(--dur-eq) * -0.35)");
  });
});

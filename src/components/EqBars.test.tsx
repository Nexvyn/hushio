import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EqBars } from "./EqBars";

afterEach(cleanup);

describe("EqBars", () => {
  it("renders three static bars in the accent colour while the row is playing", () => {
    render(<EqBars playing />);
    const bars = screen.getByRole("img", { name: "Playing" }).querySelectorAll("span");
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.classList.contains("bt-eq")).toBe(false);
      expect(bar.style.animationDelay).toBe("");
      expect(bar.classList.contains("bg-accent")).toBe(true);
    }
  });

  it("keeps the same still glyph in ink when the row is paused", () => {
    render(<EqBars playing={false} />);
    const bars = screen.getByRole("img", { name: "Playing" }).querySelectorAll("span");
    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.classList.contains("bt-eq")).toBe(false);
      expect(bar.classList.contains("bg-ink-2")).toBe(true);
    }
  });
});

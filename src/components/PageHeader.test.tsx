import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClockCounterClockwise, Heart } from "@phosphor-icons/react";
import { PageHeader, monogram } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as the page heading with meta and actions", () => {
    render(
      <PageHeader title="Liked Songs" meta="12 songs · 40 min" actions={<button type="button">Play</button>} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Liked Songs" })).toBeTruthy();
    expect(screen.getByText("12 songs · 40 min").className).toContain("tabular-nums");
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("shows no artwork tile when the artwork prop is omitted", () => {
    const { container } = render(<PageHeader title="Explore" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByTestId("page-monogram")).toBeNull();
  });

  it("shows the cover when one is given", () => {
    const { container } = render(<PageHeader title="Mix" artwork="https://example.test/a.jpg" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.test/a.jpg");
  });

  it("falls back to a monogram when artwork is null", () => {
    render(<PageHeader title="downloads" artwork={null} />);
    expect(screen.getByTestId("page-monogram").textContent).toBe("D");
  });

  it("shows the hero icon tile instead of a letter when there is no artwork", () => {
    const { container } = render(<PageHeader title="History" artwork={null} tile={{ icon: ClockCounterClockwise }} />);
    expect(container.querySelector('[data-testid="page-monogram"]')).toBeNull();
    const tile = container.querySelector('[data-testid="page-tile"]');
    expect(tile?.className).toContain("bg-wash");
    expect(tile?.className).toContain("text-accent");
  });

  it("uses the accent tile for Liked Songs", () => {
    const { container } = render(<PageHeader title="Liked Songs" artwork={null} tile={{ icon: Heart, accent: true }} />);
    const tile = container.querySelector('[data-testid="page-tile"]');
    expect(tile?.className).toContain("bg-accent");
    expect(tile?.className).toContain("text-on-accent");
  });
});

describe("monogram", () => {
  it.each([
    ["Chill", "C"],
    ["  arijit ", "A"],
    ["", ""],
  ])("%j gives %j", (title, letter) => {
    expect(monogram(title)).toBe(letter);
  });
});

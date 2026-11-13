import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders a level 2 heading with the section type", () => {
    render(<SectionHeader title="Quick picks" id="quick" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Quick picks" });
    expect(heading.id).toBe("quick");
    expect(heading.className).toContain("text-section");
  });

  it("shows a tabular count when given", () => {
    render(<SectionHeader title="Moods" count={12} />);
    expect(screen.getByText("12").className).toContain("tabular-nums");
  });

  it("calls the action when Show all is pressed", () => {
    const onClick = vi.fn();
    render(<SectionHeader title="New releases" action={{ label: "Show all", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders no button without an action", () => {
    const { container } = render(<SectionHeader title="Genres" />);
    expect(container.querySelector("button")).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bridge = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  watchWindowMaximized: vi.fn(),
}));

vi.mock("../lib/bridge", () => bridge);

const setMaximized = (maximized: boolean) => {
  bridge.watchWindowMaximized.mockImplementation(async (onChange: (value: boolean) => void) => {
    onChange(maximized);
    return () => {};
  });
};

import { CaptionButtons } from "./CaptionButtons";

describe("CaptionButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMaximized(false);
  });

  afterEach(cleanup);

  it("renders Minimize, Maximize and Close buttons", () => {
    render(<CaptionButtons />);

    expect(screen.getByRole("button", { name: "Minimize" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maximise" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("calls the matching bridge function on click", async () => {
    const user = userEvent.setup();
    render(<CaptionButtons />);

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    expect(bridge.minimizeWindow).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Maximise" }));
    expect(bridge.toggleMaximizeWindow).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(bridge.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("switches the maximize button to Restore when the window is maximized", async () => {
    setMaximized(true);
    render(<CaptionButtons />);

    expect(await screen.findByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Maximise" })).toBeNull();
  });

  it("uses the 40px squircle shape in the compact variant and keeps the danger hover on Close", () => {
    render(<CaptionButtons variant="compact" />);
    for (const name of ["Minimize", "Maximise", "Close"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("h-10");
      expect(button.className).toContain("w-10");
      expect(button.className).toContain("rounded-[12px]");
      expect(button.className).toContain("[corner-shape:squircle]");
      expect(button.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("hover:bg-[rgb(var(--danger))]");
    expect(screen.getByRole("button", { name: "Minimize" }).className).not.toContain("hover:bg-[rgb(var(--danger))]");
  });

  it("packs the compact buttons with no gap", () => {
    render(<CaptionButtons variant="compact" />);
    const group = screen.getByRole("button", { name: "Minimize" }).parentElement;
    expect(group?.className).toContain("gap-0");
    expect(group?.className).not.toContain("gap-2");
  });

  it("moves focus through Minimize, Maximize and Close in order with Tab", async () => {
    const user = userEvent.setup();
    render(<CaptionButtons />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Minimize" }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Maximise" }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });
});

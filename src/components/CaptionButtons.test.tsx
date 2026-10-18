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
    expect(screen.getByRole("button", { name: "Maximize" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("calls the matching bridge function on click", async () => {
    const user = userEvent.setup();
    render(<CaptionButtons />);

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    expect(bridge.minimizeWindow).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Maximize" }));
    expect(bridge.toggleMaximizeWindow).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(bridge.closeWindow).toHaveBeenCalledTimes(1);
  });

  it("switches the maximize button to Restore when the window is maximized", async () => {
    setMaximized(true);
    render(<CaptionButtons />);

    expect(await screen.findByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull();
  });

  it("moves focus through Minimize, Maximize and Close in order with Tab", async () => {
    const user = userEvent.setup();
    render(<CaptionButtons />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Minimize" }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Maximize" }));

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });
});

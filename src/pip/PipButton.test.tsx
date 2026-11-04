import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const bridge = vi.hoisted(() => {
  const env = { platform: "windows" as "windows" | "android" };
  const handlers: { open?: (open: boolean) => void } = {};
  return {
    env,
    handlers,
    pipToggle: vi.fn(async () => true),
    pipIsOpen: vi.fn(async () => false),
    listenPipOpenChanged: vi.fn(async (fn: (open: boolean) => void) => {
      handlers.open = fn;
      return () => {};
    }),
    persistRead: vi.fn(async () => null),
    persistWrite: vi.fn(async () => true),
  };
});

vi.mock("../lib/bridge", () => ({
  get platform() {
    return bridge.env.platform;
  },
  pipToggle: bridge.pipToggle,
  pipIsOpen: bridge.pipIsOpen,
  listenPipOpenChanged: bridge.listenPipOpenChanged,
  persistRead: bridge.persistRead,
  persistWrite: bridge.persistWrite,
}));

import { PipButton } from "./PipButton";

describe("PipButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.env.platform = "windows";
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the mini player from the player bar and shows it as pressed", async () => {
    bridge.pipToggle.mockResolvedValueOnce(true);
    render(<PipButton />);
    fireEvent.click(screen.getByRole("button", { name: "Open mini player" }));
    expect(bridge.pipToggle).toHaveBeenCalledTimes(1);
    const button = await screen.findByRole("button", { name: "Close mini player" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("follows the window when it is closed from elsewhere", async () => {
    render(<PipButton />);
    await act(async () => {});
    await act(async () => {
      bridge.handlers.open?.(true);
    });
    expect(screen.getByRole("button", { name: "Close mini player" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => {
      bridge.handlers.open?.(false);
    });
    expect(screen.getByRole("button", { name: "Open mini player" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("starts pressed when the window is already open", async () => {
    bridge.pipIsOpen.mockResolvedValueOnce(true);
    render(<PipButton />);
    expect(await screen.findByRole("button", { name: "Close mini player" })).toBeTruthy();
  });

  it("is not shown on Android, which has no mini player window", () => {
    bridge.env.platform = "android";
    const { container } = render(<PipButton />);
    expect(container.childElementCount).toBe(0);
  });
});

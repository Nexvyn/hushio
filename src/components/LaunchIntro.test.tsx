import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const bridge = vi.hoisted(() => ({
  introDone: vi.fn(),
}));

const motion = vi.hoisted(() => ({
  animate: vi.fn(() => Object.assign(Promise.resolve(), { stop: vi.fn() })),
}));

vi.mock("../lib/bridge", () => ({ ...bridge, platform: "windows" }));
vi.mock("motion/react", () => motion);

import { introFinished, resetIntroForTests } from "../lib/intro";
import { LaunchIntro } from "./LaunchIntro";

describe("LaunchIntro", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    bridge.introDone.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.documentElement.classList.remove("reduce-motion");
  });

  it("plays once, waits for the ready event, calls introDone once and removes itself", async () => {
    const view = render(<LaunchIntro ready={false} />);
    expect(screen.getByRole("img", { name: "Hushio" })).toBeTruthy();
    expect(bridge.introDone).not.toHaveBeenCalled();

    view.rerender(<LaunchIntro ready />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(bridge.introDone).toHaveBeenCalledTimes(1);
    expect(introFinished()).toBe(true);
    expect(view.container.innerHTML).toBe("");
  });

  it("lets a click skip the intro at once", () => {
    resetIntroForTests();
    const view = render(<LaunchIntro ready={false} />);
    expect(screen.getByRole("img", { name: "Hushio" })).toBeTruthy();

    act(() => {
      view.container.ownerDocument.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });

    expect(view.container.innerHTML).toBe("");
    expect(introFinished()).toBe(true);
    expect(bridge.introDone).toHaveBeenCalledTimes(1);
  });

  it("does not play again in the same launch", () => {
    const view = render(<LaunchIntro ready />);
    expect(view.container.innerHTML).toBe("");
    expect(bridge.introDone).not.toHaveBeenCalled();
  });
});

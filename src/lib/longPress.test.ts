import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, LongPress } from "./longPress";

describe("LongPress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after 300 ms when the finger stays still", () => {
    const fire = vi.fn();
    const press = new LongPress(fire);
    press.start({ x: 10, y: 10 });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(press.pending).toBe(false);
  });

  it("cancels when the finger moves more than 5 dp", () => {
    const fire = vi.fn();
    const press = new LongPress(fire);
    press.start({ x: 0, y: 0 });
    expect(press.move({ x: 3, y: 4 })).toBe(false);
    expect(press.move({ x: 3, y: 5 })).toBe(true);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).not.toHaveBeenCalled();
  });

  it("cancel stops a pending press and a new start replaces the old timer", () => {
    const fire = vi.fn();
    const press = new LongPress(fire);
    press.start({ x: 0, y: 0 });
    press.cancel();
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).not.toHaveBeenCalled();
    press.start({ x: 0, y: 0 });
    press.start({ x: 1, y: 1 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(press.move({ x: 1, y: 1 })).toBe(false);
  });

  it("ignores moves when no press is pending", () => {
    const press = new LongPress(() => {});
    expect(press.move({ x: 50, y: 50 })).toBe(false);
  });
});

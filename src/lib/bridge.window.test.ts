import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
  watchWindowMaximized,
} from "./bridge";

const mocks = vi.hoisted(() => {
  const resizeHandlers = new Set<() => void>();
  const state = { maximized: false };
  const win = {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(async () => state.maximized),
    onResized: vi.fn(async (handler: () => void) => {
      resizeHandlers.add(handler);
      return () => {
        resizeHandlers.delete(handler);
      };
    }),
  };
  const emitResize = () => {
    for (const handler of [...resizeHandlers]) handler();
  };
  return { win, state, resizeHandlers, emitResize };
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mocks.win,
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("bridge window wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resizeHandlers.clear();
    mocks.state.maximized = false;
  });

  it("minimizeWindow calls minimize", async () => {
    await minimizeWindow();

    expect(mocks.win.minimize).toHaveBeenCalledTimes(1);
    expect(mocks.win.close).not.toHaveBeenCalled();
  });

  it("toggleMaximizeWindow calls toggleMaximize", async () => {
    await toggleMaximizeWindow();

    expect(mocks.win.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(mocks.win.minimize).not.toHaveBeenCalled();
  });

  it("closeWindow calls close", async () => {
    await closeWindow();

    expect(mocks.win.close).toHaveBeenCalledTimes(1);
    expect(mocks.win.minimize).not.toHaveBeenCalled();
  });

  it("watchWindowMaximized reports the current state, later resizes, and stops after unsubscribe", async () => {
    const onChange = vi.fn();
    const unlisten = await watchWindowMaximized(onChange);

    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(false));

    mocks.state.maximized = true;
    mocks.emitResize();

    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith(true));
    expect(onChange).toHaveBeenCalledTimes(2);

    unlisten();

    mocks.state.maximized = false;
    mocks.emitResize();
    await flush();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(mocks.resizeHandlers.size).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ call: vi.fn() }));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  call: bridge.call,
}));

import { useCrashes } from "./crashes";

const LOG = { at: 1_793_527_200, message: "boom" };

describe("crash logs store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCrashes.setState({ logs: [], loaded: false });
  });

  it("fetches the logs from the crash_logs command", async () => {
    bridge.call.mockResolvedValue([LOG]);

    await useCrashes.getState().fetchCrashes();

    expect(bridge.call).toHaveBeenCalledWith("crash_logs");
    expect(useCrashes.getState()).toMatchObject({ logs: [LOG], loaded: true });
  });

  it("empties the list from the result of crash_logs_clear", async () => {
    useCrashes.setState({ logs: [LOG], loaded: true });
    bridge.call.mockResolvedValue([]);

    await useCrashes.getState().clearCrashes();

    expect(bridge.call).toHaveBeenCalledWith("crash_logs_clear");
    expect(useCrashes.getState().logs).toEqual([]);
  });

  it("marks the list as loaded and keeps it empty when the command fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    bridge.call.mockRejectedValue(new Error("not available"));

    await useCrashes.getState().fetchCrashes();

    expect(useCrashes.getState()).toMatchObject({ logs: [], loaded: true });
    spy.mockRestore();
  });
});

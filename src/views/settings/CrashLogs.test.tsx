import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bridge = vi.hoisted(() => ({ call: vi.fn(), writeText: vi.fn(async () => undefined) }));

vi.mock("../../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bridge")>()),
  call: bridge.call,
}));

import { CrashLogs, crashText } from "./CrashLogs";
import { useCrashes } from "../../stores/crashes";
import { useNavigation } from "../../stores/navigation";

const LOGS = [
  { at: 1_793_527_200, message: "panicked at src/lib.rs:1" },
  { at: 1_793_440_800, message: "second crash" },
];

describe("CrashLogs view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCrashes.setState({ logs: [], loaded: false });
    bridge.call.mockImplementation(async (command: string) => {
      if (command === "crash_logs") return LOGS;
      if (command === "crash_logs_clear") return [];
      return null;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the crash logs from the native side and lists each one", async () => {
    render(<CrashLogs />);

    expect(await screen.findByText("panicked at src/lib.rs:1")).toBeTruthy();
    expect(screen.getByText("second crash")).toBeTruthy();
    expect(bridge.call).toHaveBeenCalledWith("crash_logs");
  });

  it("copies one crash with its time and message", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: bridge.writeText }, configurable: true });
    render(<CrashLogs />);
    const [copy] = await screen.findAllByRole("button", { name: /Copy crash/ });

    await user.click(copy);

    expect(bridge.writeText).toHaveBeenCalledWith(crashText(LOGS[0]));
    expect(await screen.findByText("Copied")).toBeTruthy();
  });

  it("clears every log through the native command and shows the empty state", async () => {
    const user = userEvent.setup();
    render(<CrashLogs />);
    await screen.findByText("second crash");

    await user.click(screen.getByRole("button", { name: "Clear all logs" }));

    expect(bridge.call).toHaveBeenCalledWith("crash_logs_clear");
    await waitFor(() => expect(screen.getByText("No crashes recorded")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Clear all logs" })).toBeNull();
  });

  it("returns to the About page from the back button", async () => {
    const user = userEvent.setup();
    render(<CrashLogs />);
    await screen.findByText("second crash");

    await user.click(screen.getByRole("button", { name: "Back to settings" }));

    expect(useNavigation.getState().view).toEqual({ name: "settings", param: "about" });
  });
});

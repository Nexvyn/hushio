import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ crashReport: vi.fn() }));

vi.mock("./bridge", () => ({ crashReport: bridge.crashReport }));

type CrashModule = typeof import("./crashReport");

describe("crash reporting", () => {
  let mod: CrashModule;
  let uninstall: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    bridge.crashReport.mockResolvedValue(undefined);
    mod = await import("./crashReport");
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it("allows at most five reports in a minute and then drops the rest", () => {
    const allow = mod.createThrottle(5, 60_000);
    const results = Array.from({ length: 6 }, () => allow(0));
    expect(results).toEqual([true, true, true, true, true, false]);
    expect(allow(59_999)).toBe(false);
    expect(allow(60_000)).toBe(true);
  });

  it("sends no more than five reports from reportCrash", () => {
    for (let index = 0; index < 8; index += 1) mod.reportCrash(new Error(`boom ${index}`));
    expect(bridge.crashReport).toHaveBeenCalledTimes(5);
  });

  it("forwards window errors with the error name, message and first stack lines", () => {
    uninstall = mod.installCrashReporting(window);
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("kaboom") }));
    expect(bridge.crashReport).toHaveBeenCalledTimes(1);
    const message = bridge.crashReport.mock.calls[0][0] as string;
    expect(message.split("\n")[0]).toBe("Error: kaboom");
  });

  it("forwards unhandled rejections with their reason", () => {
    uninstall = mod.installCrashReporting(window);
    const event = new Event("unhandledrejection");
    Object.assign(event, { reason: new Error("nope") });
    window.dispatchEvent(event);
    expect(bridge.crashReport.mock.calls[0][0]).toMatch(/^Error: nope/);
  });

  it("stops forwarding after the listeners are removed", () => {
    uninstall = mod.installCrashReporting(window);
    uninstall();
    uninstall = undefined;
    const event = new Event("unhandledrejection");
    Object.assign(event, { reason: new Error("late") });
    window.dispatchEvent(event);
    expect(bridge.crashReport).not.toHaveBeenCalled();
  });

  it("keeps only the first stack lines of an error", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at a (x.js:1)\n    at b\n    at c\n    at d\n    at e\n    at f";
    expect(mod.formatCrash(error).split("\n")).toEqual([
      "Error: boom",
      "at a (x.js:1)",
      "at b",
      "at c",
      "at d",
    ]);
  });

  it("does not throw when the bridge call fails", async () => {
    bridge.crashReport.mockRejectedValue(new Error("offline"));
    expect(() => mod.reportCrash(new Error("first"))).not.toThrow();
    await Promise.resolve();

    bridge.crashReport.mockImplementation(() => {
      throw new Error("sync failure");
    });
    expect(() => mod.reportCrash(new Error("second"))).not.toThrow();
  });
});

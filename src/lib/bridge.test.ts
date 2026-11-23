import { beforeEach, describe, expect, it, vi } from "vitest";
import { call, detectPlatform } from "./bridge";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

describe("detectPlatform", () => {
  it("maps user agents to the four platforms", () => {
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5)")).toBe("macos");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
  });

  it("refuses unknown user agents", () => {
    expect(() => detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toThrow(
      "Unsupported platform",
    );
  });
});

describe("call", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("names the command when Tauri reports it as missing", async () => {
    invoke.mockRejectedValue("Command foo not found");

    await expect(call("foo")).rejects.toThrow('Native command "foo" is not available');
  });

  it("rethrows other 'not found' errors unchanged", async () => {
    const message = "Server replied 404 Not Found";
    invoke.mockRejectedValue(message);

    await expect(call("foo")).rejects.toBe(message);
  });

  it("passes an Error object with its real message through unchanged", async () => {
    const error = new Error("disk full");
    invoke.mockRejectedValue(error);

    await expect(call("foo")).rejects.toBe(error);
  });
});

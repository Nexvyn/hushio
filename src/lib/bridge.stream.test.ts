import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamProxyPort } from "./bridge";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

describe("streamProxyPort", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("returns the loopback port the native proxy reports", async () => {
    invoke.mockResolvedValue(51234);

    await expect(streamProxyPort()).resolves.toBe(51234);
    expect(invoke.mock.calls[0][0]).toBe("stream_proxy_port");
  });

  it("names the missing native command when the proxy command is not registered", async () => {
    invoke.mockRejectedValue("command stream_proxy_port not found");

    await expect(streamProxyPort()).rejects.toThrow(
      'Native command "stream_proxy_port" is not available',
    );
  });

  it("passes other native errors through unchanged", async () => {
    invoke.mockRejectedValue(new Error("proxy bind failed"));

    await expect(streamProxyPort()).rejects.toThrow("proxy bind failed");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const bridge = vi.hoisted(() => ({
  updateCheck: vi.fn(),
  updateDownload: vi.fn(),
  updateInstall: vi.fn(),
  updateOpenInstallSettings: vi.fn(async () => undefined),
}));

vi.mock("../../lib/bridge", () => ({
  listenPlayerEvent: vi.fn(async () => () => {}),
  ...bridge,
}));

import { AndroidUpdateControl } from "./AndroidUpdateControl";

beforeEach(() => {
  bridge.updateCheck.mockResolvedValue({ state: "available", version: "1.2.0" } as never);
  bridge.updateDownload.mockResolvedValue({ path: "/cache/hushio-1.2.0.apk" });
  bridge.updateInstall.mockResolvedValueOnce({ state: "unknown_sources" } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AndroidUpdateControl", () => {
  it("lets you retry Install after returning from the unknown sources settings", async () => {
    render(<AndroidUpdateControl current="1.1.0" />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    fireEvent.click(await screen.findByRole("button", { name: "Update" }));
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open settings" }));

    expect(bridge.updateOpenInstallSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Install" }));

    await waitFor(() => expect(bridge.updateInstall).toHaveBeenCalledTimes(2));
    expect(bridge.updateInstall).toHaveBeenLastCalledWith("/cache/hushio-1.2.0.apk");
  });
});

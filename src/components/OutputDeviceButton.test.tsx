import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OutputDeviceButton } from "./OutputDeviceButton";
import { useSettings } from "../stores/settings";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const DEVICES = [
  { kind: "audiooutput", deviceId: "default", groupId: "g-hdst", label: "Default - Headset" },
  { kind: "audiooutput", deviceId: "spk", groupId: "g-spk", label: "Speakers" },
  { kind: "audiooutput", deviceId: "hdst", groupId: "g-hdst", label: "Headset" },
];

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { enumerateDevices: vi.fn(async () => DEVICES), getUserMedia: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
    writable: true,
  });
  useSettings.setState({ audioSinkId: "" });
});

afterEach(() => {
  cleanup();
});

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Output device: System default" }));
  return screen.findByRole("menu", { name: "Output devices" });
}

describe("OutputDeviceButton", () => {
  it("lists the outputs and pins the one picked", async () => {
    render(<OutputDeviceButton />);
    await openMenu();
    const speakers = await screen.findByRole("menuitemradio", { name: /Speakers/ });
    fireEvent.click(speakers);
    expect(useSettings.getState().audioSinkId).toBe("spk");
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Output devices" })).toBeNull());
  });

  it("closes on Escape", async () => {
    render(<OutputDeviceButton />);
    await openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Output devices" })).toBeNull());
  });

  it("moves focus with the arrow keys", async () => {
    render(<OutputDeviceButton />);
    const menu = await openMenu();
    const items = await screen.findAllByRole("menuitemradio");
    items[0].focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });
});

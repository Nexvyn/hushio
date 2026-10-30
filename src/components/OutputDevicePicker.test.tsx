import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OutputDevicePicker } from "./OutputDevicePicker";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const DEVICES = [
  { kind: "audiooutput", deviceId: "default", groupId: "g-hdst", label: "Default - Headset" },
  { kind: "audiooutput", deviceId: "communications", groupId: "g-hdst", label: "Communications" },
  { kind: "audiooutput", deviceId: "spk", groupId: "g-spk", label: "Speakers" },
  { kind: "audiooutput", deviceId: "hdst", groupId: "g-hdst", label: "Headset" },
  { kind: "audioinput", deviceId: "mic", groupId: "g-mic", label: "Microphone" },
];

let enumerateDevices: ReturnType<typeof vi.fn>;
let addEventListener: ReturnType<typeof vi.fn>;
let removeEventListener: ReturnType<typeof vi.fn>;

beforeEach(() => {
  enumerateDevices = vi.fn(async () => DEVICES);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", {
    value: { enumerateDevices, getUserMedia: vi.fn(), addEventListener, removeEventListener },
    configurable: true,
    writable: true,
  });
  useSettings.setState({ audioSinkId: "" });
  useUI.setState({ contextMenu: null });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("OutputDevicePicker", () => {
  it("shows System default while nothing is pinned", async () => {
    render(<OutputDevicePicker />);

    expect(await screen.findByRole("button", { name: "System default" })).toBeTruthy();
  });

  it("shows the pinned device label once the list is read", async () => {
    useSettings.setState({ audioSinkId: "spk" });
    render(<OutputDevicePicker />);

    expect(await screen.findByRole("button", { name: "Speakers" })).toBeTruthy();
  });

  it("refreshes the list on devicechange", async () => {
    render(<OutputDevicePicker />);
    await screen.findByRole("button", { name: "System default" });

    expect(addEventListener).toHaveBeenCalledWith("devicechange", expect.any(Function));
  });

  it("opens a choice menu with System default, the active device note and each output", async () => {
    render(<OutputDevicePicker />);
    fireEvent.click(await screen.findByRole("button", { name: "System default" }));

    await waitFor(() => expect(useUI.getState().contextMenu).not.toBeNull());
    const items = useUI.getState().contextMenu?.items ?? [];
    expect(items.map((item) => item.label)).toEqual(["System default", "Speakers", "Headset"]);
    expect(items[0].note).toBe("Headset");
    expect(items[0].checked).toBe(true);
    expect(items[1].checked).toBe(false);
  });

  it("pins the chosen device and returns to the system default", async () => {
    render(<OutputDevicePicker />);
    fireEvent.click(await screen.findByRole("button", { name: "System default" }));
    await waitFor(() => expect(useUI.getState().contextMenu).not.toBeNull());

    useUI.getState().contextMenu?.items[1].onSelect?.();
    expect(useSettings.getState().audioSinkId).toBe("spk");

    useUI.getState().contextMenu?.items[0].onSelect?.();
    expect(useSettings.getState().audioSinkId).toBe("");
  });

  it("anchors the menu to the right edge of the picker", async () => {
    render(<OutputDevicePicker />);
    fireEvent.click(await screen.findByRole("button", { name: "System default" }));

    await waitFor(() => expect(useUI.getState().contextMenu).not.toBeNull());
    expect(useUI.getState().contextMenu?.alignRight).toBe(true);
  });
});

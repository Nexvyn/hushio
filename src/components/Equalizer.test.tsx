import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Equalizer } from "./Equalizer";
import { EQ_PRESET_LIMIT, EQ_PRESETS, EQ_RANGE, flatGains } from "../lib/eq";
import { displayToEngine, EQ_MOODS, fractionToGain, gainToFraction } from "../lib/eqCurve";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const PLOT_HEIGHT = 460;

class FakePointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.isPrimary = init.isPrimary ?? true;
  }
}

if (!("PointerEvent" in window)) Object.defineProperty(window, "PointerEvent", { value: FakePointerEvent });

function audioNode(): unknown {
  const target = function () {};
  return new Proxy(target, {
    get: (object, key) => (key in object ? Reflect.get(object, key) : key === "then" ? undefined : audioNode()),
    apply: () => audioNode(),
  });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: PLOT_HEIGHT,
    width: 1000,
    height: PLOT_HEIGHT,
    toJSON: () => ({}),
  } as DOMRect);
  vi.stubGlobal("AudioContext", function FakeAudioContext() {
    return new Proxy(audioNode() as object, {
      get: (object, key) => (key === "sampleRate" ? 48000 : Reflect.get(object, key)),
    });
  });
  useSettings.setState({ eqEnabled: true, eqGains: flatGains(), eqPresets: [], eqAutoHeadroom: true });
  useUI.setState({ toasts: [], dialog: null, contextMenu: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderEqualizer() {
  render(<Equalizer />);
}

function band(label: string): HTMLElement {
  return screen.getByRole("slider", { name: label });
}

function segment(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function select(item: MenuItem | undefined) {
  act(() => {
    item?.onSelect?.();
  });
}

function openActions(): MenuItem[] {
  fireEvent.click(screen.getByRole("button", { name: "Preset actions" }));
  return useUI.getState().contextMenu?.items ?? [];
}

function latestToast(): string | undefined {
  return useUI.getState().toasts.at(-1)?.message;
}

function engineGains(): number[] {
  return useSettings.getState().eqGains;
}

describe("bands", () => {
  it("shows seven bands from 60 Hz to 14 kHz", () => {
    renderEqualizer();
    const labels = screen
      .getAllByRole("slider")
      .map((slider) => slider.getAttribute("aria-label"))
      .filter((label) => label !== "Seek");
    expect(labels).toEqual(["60 Hz", "150 Hz", "400 Hz", "1 kHz", "2.4 kHz", "6 kHz", "14 kHz"]);
  });

  it("writes the ten engine gains that the seven display bands map to", () => {
    renderEqualizer();

    fireEvent.keyDown(band("60 Hz"), { key: "ArrowUp" });

    expect(engineGains()).toEqual(displayToEngine([1, 0, 0, 0, 0, 0, 0]));
    expect(engineGains()).toHaveLength(10);
  });

  it("steps a band by 1 dB with the arrow keys and by 3 with Page Up and Down", () => {
    renderEqualizer();

    fireEvent.keyDown(band("60 Hz"), { key: "ArrowUp" });
    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("1");

    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });
    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("4");

    fireEvent.keyDown(band("60 Hz"), { key: "ArrowDown" });
    fireEvent.keyDown(band("60 Hz"), { key: "PageDown" });
    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("0");
  });

  it("jumps a band to the ends of the range with Home and End", () => {
    renderEqualizer();

    fireEvent.keyDown(band("6 kHz"), { key: "End" });
    expect(band("6 kHz").getAttribute("aria-valuenow")).toBe(String(EQ_RANGE));

    fireEvent.keyDown(band("6 kHz"), { key: "Home" });
    expect(band("6 kHz").getAttribute("aria-valuenow")).toBe(String(-EQ_RANGE));
  });

  it("clamps a band to plus or minus 12 dB", () => {
    renderEqualizer();
    fireEvent.keyDown(band("60 Hz"), { key: "End" });

    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });

    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe(String(EQ_RANGE));
  });

  it("resets a band to 0 dB on double click", () => {
    renderEqualizer();
    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });

    fireEvent.doubleClick(band("60 Hz"));

    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("0");
  });

  it("exposes the signed gain as the spoken value", () => {
    useSettings.setState({ eqGains: new Array(10).fill(-2) });
    renderEqualizer();

    expect(band("60 Hz").getAttribute("aria-valuetext")).toBe("−2 dB at 60 Hz");
    expect(band("6 kHz").getAttribute("aria-valuetext")).toBe("−2 dB at 6 kHz");
    expect(band("6 kHz").getAttribute("aria-valuenow")).toBe("-2");
  });

  it("drags a band by pointer and writes whole dB", () => {
    renderEqualizer();
    const handle = band("60 Hz");

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: gainToFraction(0) * PLOT_HEIGHT, isPrimary: true });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: gainToFraction(6) * PLOT_HEIGHT });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: gainToFraction(6) * PLOT_HEIGHT });

    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("6");
    expect(fractionToGain(gainToFraction(6))).toBe(6);
  });

  it("ignores pointer moves from another pointer", () => {
    renderEqualizer();
    const handle = band("60 Hz");

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: gainToFraction(0) * PLOT_HEIGHT, isPrimary: true });
    fireEvent.pointerMove(handle, { pointerId: 2, clientY: gainToFraction(EQ_RANGE) * PLOT_HEIGHT });

    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("0");
  });
});

describe("mood segments", () => {
  it("shows Flat, Warm, Air and Night and selects Flat first", () => {
    renderEqualizer();

    expect(["Flat", "Warm", "Air", "Night"].map((name) => segment(name).getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
  });

  it("applies Warm across the seven bands and marks it pressed", () => {
    renderEqualizer();

    fireEvent.click(segment("Warm"));

    expect(engineGains()).toEqual(displayToEngine(EQ_MOODS.Warm));
    expect(band("60 Hz").getAttribute("aria-valuenow")).toBe("8");
    expect(band("14 kHz").getAttribute("aria-valuenow")).toBe("-6");
    expect(segment("Warm").getAttribute("aria-pressed")).toBe("true");
    expect(segment("Flat").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the mood selected when a band is dragged back to the same curve", () => {
    renderEqualizer();
    fireEvent.click(segment("Air"));

    fireEvent.keyDown(band("60 Hz"), { key: "ArrowUp" });
    expect(segment("Air").getAttribute("aria-pressed")).toBe("false");

    fireEvent.keyDown(band("60 Hz"), { key: "ArrowDown" });
    expect(segment("Air").getAttribute("aria-pressed")).toBe("true");
  });

  it("reads a stored engine curve back onto the seven bands", () => {
    useSettings.setState({ eqGains: new Array(10).fill(3) });
    renderEqualizer();

    expect(["60 Hz", "1 kHz", "14 kHz"].map((label) => band(label).getAttribute("aria-valuenow"))).toEqual(["3", "3", "3"]);
    expect(["Flat", "Warm", "Air", "Night"].every((name) => segment(name).getAttribute("aria-pressed") === "false")).toBe(true);
  });
});

describe("actions menu", () => {
  it("lists the other built-in presets without Flat, then saved presets", () => {
    useSettings.setState({ eqPresets: [{ name: "Late", gains: flatGains() }] });
    renderEqualizer();

    const labels = openActions().map((item) => item.label);

    expect(labels.slice(0, 5)).toEqual(["Bass", "Treble", "Vocal", "Loudness", "Late"]);
  });

  it("applies a built-in preset from the menu with its exact gains", () => {
    renderEqualizer();

    select(openActions().find((item) => item.label === "Bass"));

    expect(engineGains()).toEqual([...EQ_PRESETS.Bass]);
    expect(segment("Flat").getAttribute("aria-pressed")).toBe("false");
  });

  it("resets the curve to flat", () => {
    renderEqualizer();
    fireEvent.click(segment("Night"));

    select(openActions().find((item) => item.label === "Reset to flat"));

    expect(engineGains()).toEqual(flatGains());
    expect(segment("Flat").getAttribute("aria-pressed")).toBe("true");
  });

  it("disables Save as preset while a mood or preset already matches", () => {
    renderEqualizer();
    fireEvent.click(segment("Warm"));

    expect(openActions().find((item) => item.label === "Save as preset")?.disabled).toBe(true);
  });

  it("disables Save as preset while the equalizer is off", () => {
    useSettings.setState({ eqEnabled: false, eqGains: displayToEngine([4, 0, 0, 0, 0, 0, 0]) });
    renderEqualizer();

    expect(openActions().find((item) => item.label === "Save as preset")?.disabled).toBe(true);
  });
});

describe("own presets", () => {
  function saveCurrent(name: string) {
    renderEqualizer();
    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });
    select(openActions().find((item) => item.label === "Save as preset"));
    useUI.getState().dialog?.onConfirm(name);
  }

  it("opens the Save preset dialog with the PRD text", () => {
    renderEqualizer();
    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });

    select(openActions().find((item) => item.label === "Save as preset"));

    expect(useUI.getState().dialog).toMatchObject({
      title: "Save preset",
      placeholder: "Preset name",
      initialValue: "My preset",
      confirmLabel: "Save",
    });
  });

  it("saves the current engine curve under its trimmed name", () => {
    saveCurrent("  Late night  ");

    expect(useSettings.getState().eqPresets).toEqual([{ name: "Late night", gains: engineGains() }]);
  });

  it("refuses a built-in name and a mood name with the PRD toast", () => {
    saveCurrent("Bass");
    expect(latestToast()).toBe('"Bass" is a built-in preset. Pick another name');

    useUI.setState({ dialog: null });
    select(openActions().find((item) => item.label === "Save as preset"));
    useUI.getState().dialog?.onConfirm("Warm");
    expect(latestToast()).toBe('"Warm" is a built-in preset. Pick another name');
    expect(useSettings.getState().eqPresets).toEqual([]);
  });

  it("refuses a duplicate name with the PRD toast", () => {
    useSettings.setState({ eqPresets: [{ name: "Late", gains: flatGains() }] });
    renderEqualizer();
    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });
    select(openActions().find((item) => item.label === "Save as preset"));

    useUI.getState().dialog?.onConfirm("Late");

    expect(latestToast()).toBe('You already have a preset called "Late"');
    expect(useSettings.getState().eqPresets).toHaveLength(1);
  });

  it("keeps at most 20 presets and drops the oldest", () => {
    useSettings.setState({
      eqPresets: Array.from({ length: EQ_PRESET_LIMIT }, (_, index) => ({ name: `P${index}`, gains: flatGains() })),
    });
    renderEqualizer();
    fireEvent.keyDown(band("60 Hz"), { key: "PageUp" });
    select(openActions().find((item) => item.label === "Save as preset"));

    useUI.getState().dialog?.onConfirm("Newest");

    const names = useSettings.getState().eqPresets.map((preset) => preset.name);
    expect(names).toHaveLength(EQ_PRESET_LIMIT);
    expect(names[0]).toBe("P1");
    expect(names.at(-1)).toBe("Newest");
  });

  it("offers Rename, Update and Delete for the saved preset last applied", () => {
    useSettings.setState({ eqPresets: [{ name: "Late", gains: flatGains() }] });
    renderEqualizer();
    select(openActions().find((item) => item.label === "Late"));

    const items = openActions();
    expect(items.map((item) => item.label)).toEqual([
      "Bass",
      "Treble",
      "Vocal",
      "Loudness",
      "Late",
      "Save as preset",
      "Reset to flat",
      "Rename preset",
      "Update to current curve",
      "Delete preset",
    ]);
    expect(items[8].disabled).toBe(true);
    expect(items[9].danger).toBe(true);
  });

  it("updates a preset to the current curve and moves it to the end", () => {
    useSettings.setState({
      eqPresets: [
        { name: "Late", gains: flatGains() },
        { name: "Other", gains: flatGains() },
      ],
    });
    renderEqualizer();
    select(openActions().find((item) => item.label === "Late"));
    act(() => {
      useSettings.getState().setEqGains([2, ...flatGains().slice(1)]);
    });

    select(openActions().find((item) => item.label === "Update to current curve"));

    expect(useSettings.getState().eqPresets.map((preset) => preset.name)).toEqual(["Other", "Late"]);
    expect(useSettings.getState().eqPresets[1].gains[0]).toBe(2);
  });

  it("renames through the dialog and refuses a name another preset has", () => {
    useSettings.setState({
      eqPresets: [
        { name: "Late", gains: flatGains() },
        { name: "Other", gains: flatGains() },
      ],
    });
    renderEqualizer();
    select(openActions().find((item) => item.label === "Late"));
    select(openActions().find((item) => item.label === "Rename preset"));

    useUI.getState().dialog?.onConfirm("Other");
    expect(latestToast()).toBe('You already have a preset called "Other"');

    useUI.setState({ dialog: null });
    select(openActions().find((item) => item.label === "Rename preset"));
    useUI.getState().dialog?.onConfirm("Evening");

    expect(useSettings.getState().eqPresets.map((preset) => preset.name)).toEqual(["Evening", "Other"]);
  });

  it("deletes the saved preset from the actions menu", () => {
    useSettings.setState({ eqPresets: [{ name: "Late", gains: flatGains() }] });
    renderEqualizer();
    select(openActions().find((item) => item.label === "Late"));

    select(openActions().find((item) => item.label === "Delete preset"));

    expect(useSettings.getState().eqPresets).toEqual([]);
  });
});

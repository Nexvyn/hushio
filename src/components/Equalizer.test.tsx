import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ContextMenu } from "./ContextMenu";
import { Equalizer } from "./Equalizer";
import { EQ_PRESET_LIMIT, EQ_PRESETS, flatGains } from "../lib/eq";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

const BAND_32 = "32 Hz";

beforeEach(() => {
  useSettings.setState({ eqEnabled: true, eqGains: flatGains(), eqPresets: [], eqAutoHeadroom: true });
  useUI.setState({ toasts: [], dialog: null, contextMenu: null });
});

afterEach(() => {
  cleanup();
});

function renderEqualizer() {
  render(
    <>
      <Equalizer />
      <ContextMenu />
    </>,
  );
}

function band(label: string): HTMLInputElement {
  return screen.getByRole("slider", { name: label }) as HTMLInputElement;
}

function chip(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function latestToast(): string | undefined {
  return useUI.getState().toasts.at(-1)?.message;
}

describe("bands", () => {
  it("has ten bands from 32 Hz to 16 kHz", () => {
    renderEqualizer();
    const labels = screen.getAllByRole("slider").map((input) => input.getAttribute("aria-label"));
    expect(labels).toEqual(["32 Hz", "64 Hz", "125 Hz", "250 Hz", "500 Hz", "1k Hz", "2k Hz", "4k Hz", "8k Hz", "16k Hz"]);
  });

  it("writes a changed band and clamps it to plus or minus 12", () => {
    renderEqualizer();

    fireEvent.change(band(BAND_32), { target: { value: "20" } });
    expect(useSettings.getState().eqGains[0]).toBe(12);

    fireEvent.change(band(BAND_32), { target: { value: "-5" } });
    expect(useSettings.getState().eqGains[0]).toBe(-5);
  });

  it("resets a band to 0 dB on double click", () => {
    useSettings.setState({ eqGains: [7, ...flatGains().slice(1)] });
    renderEqualizer();

    fireEvent.doubleClick(band(BAND_32));

    expect(useSettings.getState().eqGains[0]).toBe(0);
  });

  it("shows the signed gain text with a real minus sign", () => {
    useSettings.setState({ eqGains: [3, 0, 0, 0, 0, 0, 0, 0, -2, 0] });
    renderEqualizer();

    expect(band(BAND_32).getAttribute("aria-valuetext")).toBe("+3");
    expect(band("8k Hz").getAttribute("aria-valuetext")).toBe("−2");
  });
});

describe("built-in presets", () => {
  it("applies a preset and marks its chip as pressed", () => {
    renderEqualizer();

    fireEvent.click(chip("Bass"));

    expect(useSettings.getState().eqGains).toEqual([...EQ_PRESETS.Bass]);
    expect(chip("Bass").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Flat").getAttribute("aria-pressed")).toBe("false");
  });

  it("disables Save as preset while the curve already matches a preset", () => {
    useSettings.setState({ eqGains: [...EQ_PRESETS.Vocal] });
    renderEqualizer();

    expect(chip("Save as preset").hasAttribute("disabled")).toBe(true);
  });

  it("disables Save as preset while the equalizer is off", () => {
    useSettings.setState({ eqEnabled: false, eqGains: [4, ...flatGains().slice(1)] });
    renderEqualizer();

    expect(chip("Save as preset").hasAttribute("disabled")).toBe(true);
  });
});

describe("own presets", () => {
  it("opens the Save preset dialog with the PRD text", () => {
    useSettings.setState({ eqGains: [4, ...flatGains().slice(1)] });
    renderEqualizer();

    fireEvent.click(chip("Save as preset"));

    expect(useUI.getState().dialog).toMatchObject({
      title: "Save preset",
      placeholder: "Preset name",
      initialValue: "My preset",
      confirmLabel: "Save",
    });
  });

  it("saves the current curve under its trimmed name", () => {
    useSettings.setState({ eqGains: [4, ...flatGains().slice(1)] });
    renderEqualizer();
    fireEvent.click(chip("Save as preset"));

    useUI.getState().dialog?.onConfirm("  Late night  ");

    expect(useSettings.getState().eqPresets).toEqual([{ name: "Late night", gains: [4, ...flatGains().slice(1)] }]);
  });

  it("refuses a built-in name with the PRD toast and saves nothing", () => {
    useSettings.setState({ eqGains: [4, ...flatGains().slice(1)] });
    renderEqualizer();
    fireEvent.click(chip("Save as preset"));

    useUI.getState().dialog?.onConfirm("Bass");

    expect(latestToast()).toBe('"Bass" is a built-in preset. Pick another name');
    expect(useSettings.getState().eqPresets).toEqual([]);
  });

  it("refuses a duplicate name with the PRD toast", () => {
    useSettings.setState({
      eqPresets: [{ name: "Late", gains: [4, ...flatGains().slice(1)] }],
      eqGains: [9, ...flatGains().slice(1)],
    });
    renderEqualizer();
    fireEvent.click(chip("Save as preset"));

    useUI.getState().dialog?.onConfirm("Late");

    expect(latestToast()).toBe('You already have a preset called "Late"');
    expect(useSettings.getState().eqPresets).toHaveLength(1);
  });

  it("keeps at most 20 presets and drops the oldest", () => {
    useSettings.setState({
      eqPresets: Array.from({ length: EQ_PRESET_LIMIT }, (_, index) => ({ name: `P${index}`, gains: flatGains() })),
      eqGains: [5, ...flatGains().slice(1)],
    });
    renderEqualizer();
    fireEvent.click(chip("Save as preset"));

    useUI.getState().dialog?.onConfirm("Newest");

    const names = useSettings.getState().eqPresets.map((preset) => preset.name);
    expect(names).toHaveLength(EQ_PRESET_LIMIT);
    expect(names[0]).toBe("P1");
    expect(names.at(-1)).toBe("Newest");
  });

  it("offers Rename, Update to current curve and Delete from the chip menu", () => {
    useSettings.setState({ eqPresets: [{ name: "Late", gains: flatGains() }] });
    renderEqualizer();

    fireEvent.contextMenu(chip("Late"));

    const items = useUI.getState().contextMenu?.items ?? [];
    expect(items.map((item) => item.label)).toEqual(["Rename", "Update to current curve", "Delete"]);
    expect(items[1].disabled).toBe(true);
    expect(items[2].danger).toBe(true);
    expect(items[2].separatorBefore).toBe(true);
  });

  it("updates a preset to the current curve and moves it to the end", () => {
    useSettings.setState({
      eqPresets: [
        { name: "Late", gains: flatGains() },
        { name: "Other", gains: flatGains() },
      ],
      eqGains: [2, ...flatGains().slice(1)],
    });
    renderEqualizer();
    fireEvent.contextMenu(chip("Late"));

    useUI.getState().contextMenu?.items[1].onSelect?.();

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
    fireEvent.contextMenu(chip("Late"));
    useUI.getState().contextMenu?.items[0].onSelect?.();

    useUI.getState().dialog?.onConfirm("Other");
    expect(latestToast()).toBe('You already have a preset called "Other"');

    useUI.setState({ dialog: null });
    fireEvent.contextMenu(chip("Late"));
    useUI.getState().contextMenu?.items[0].onSelect?.();
    useUI.getState().dialog?.onConfirm("Evening");

    expect(useSettings.getState().eqPresets.map((preset) => preset.name)).toEqual(["Evening", "Other"]);
  });

  it("deletes from the chip menu", () => {
    useSettings.setState({ eqPresets: [{ name: "Late", gains: flatGains() }] });
    renderEqualizer();
    fireEvent.contextMenu(chip("Late"));

    useUI.getState().contextMenu?.items[2].onSelect?.();

    expect(useSettings.getState().eqPresets).toEqual([]);
  });
});

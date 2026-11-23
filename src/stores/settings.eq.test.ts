import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => storage.value,
    setItem: async (_name: string, value: unknown) => {
      storage.value = value;
    },
    removeItem: async () => {
      storage.value = null;
    },
  }),
}));

import { flatGains } from "../lib/eq";
import { useSettings } from "./settings";

const initial = useSettings.getState();

beforeEach(() => {
  storage.value = null;
  useSettings.setState(initial, true);
});

describe("equalizer settings", () => {
  it("starts with EQ off, flat bands, no presets and auto headroom on", () => {
    expect(initial.eqEnabled).toBe(false);
    expect(initial.eqGains).toEqual(flatGains());
    expect(initial.eqPresets).toEqual([]);
    expect(initial.eqAutoHeadroom).toBe(true);
  });

  it("clamps each band the store is given to plus or minus 12 dB", () => {
    useSettings.getState().setEqGains([20, -20, 4, 0, 0, 0, 0, 0, 0, 0]);
    expect(useSettings.getState().eqGains.slice(0, 3)).toEqual([12, -12, 4]);
  });

  it("sanitises stored bands and presets when they load", async () => {
    storage.value = {
      state: {
        eqGains: [99, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        eqPresets: [{ name: "Late", gains: [1, 2, 3] }, { name: "Flat", gains: flatGains() }],
      },
      version: 0,
    };

    await useSettings.persist.rehydrate();

    expect(useSettings.getState().eqGains[0]).toBe(12);
    expect(useSettings.getState().eqPresets).toEqual([{ name: "Late", gains: flatGains() }]);
  });
});

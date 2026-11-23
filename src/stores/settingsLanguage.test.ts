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

import { useSettings } from "./settings";

beforeEach(() => {
  storage.value = null;
  useSettings.setState({ language: "system" });
});

describe("language setting", () => {
  it("defaults to the system language", () => {
    expect(useSettings.getState().language).toBe("system");
  });

  it("is saved when it changes", () => {
    useSettings.getState().setValue("language", "hi");
    expect(storage.value).toMatchObject({ state: { language: "hi" } });
  });

  it("is restored from storage", async () => {
    storage.value = { state: { language: "hi" }, version: 5 };
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().language).toBe("hi");
  });

  it("falls back to system when the stored value is not a language", async () => {
    storage.value = { state: { language: "fr" }, version: 5 };
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().language).toBe("system");
  });
});

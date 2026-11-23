import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => saved.value,
    setItem: async (_name: string, value: unknown) => {
      saved.value = value;
    },
    removeItem: async () => {},
  }),
}));

import { useSettings } from "./settings";

const settle = () => new Promise((done) => setTimeout(done, 0));

describe("sidebar sort", () => {
  beforeEach(() => {
    saved.value = null;
    useSettings.setState({ sidebarSort: "recents" });
  });

  it("starts on recents", () => {
    expect(useSettings.getState().sidebarSort).toBe("recents");
  });

  it("is saved with the settings", async () => {
    useSettings.getState().setValue("sidebarSort", "alpha");
    await settle();
    expect(JSON.stringify(saved.value)).toContain('"sidebarSort":"alpha"');
  });

  it("is restored from a saved value on launch", () => {
    const merge = useSettings.persist.getOptions().merge;
    const restored = merge?.({ sidebarSort: "creator" }, useSettings.getState());
    expect(restored?.sidebarSort).toBe("creator");
  });

  it("falls back to recents when the saved value is not a sort", () => {
    useSettings.setState({ sidebarSort: "alpha" });
    const merge = useSettings.persist.getOptions().merge;
    const restored = merge?.({ sidebarSort: "sideways" }, useSettings.getState());
    expect(restored?.sidebarSort).toBe("alpha");
    const fresh = merge?.({ sidebarSort: "sideways" }, { ...useSettings.getState(), sidebarSort: "recents" });
    expect(fresh?.sidebarSort).toBe("recents");
  });
});

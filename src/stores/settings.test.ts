import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  }
  return { value: null as unknown };
});

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

import { NO_DESKTOP_APPEARANCE, setDesktopAppearance } from "../lib/desktopAppearance";
import {
  applyAppearance,
  clampLyricsOffset,
  DEVICE_SETTINGS_KEYS,
  syncableSettings,
  useSettings,
} from "./settings";

const initial = useSettings.getState();

beforeEach(() => {
  storage.value = null;
  useSettings.setState(initial, true);
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.className = "";
});

describe("defaults", () => {
  it("uses the PRD defaults for appearance", () => {
    expect(initial.theme).toBe("system");
    expect(initial.reduceAnimation).toBe(false);
    expect(initial.reduceDynamicBlur).toBe(false);
    expect(initial.haptics).toBe(true);
  });

  it("uses the PRD defaults for the device keys", () => {
    expect(initial.downloadDir).toBeNull();
    expect(initial.localMusicFolder).toBeNull();
    expect(initial.audioSinkId).toBe("");
    expect(initial.lyricsOffset).toBe(0);
    expect(initial.closeToTray).toBe(true);
  });
});

describe("device settings", () => {
  it("lists exactly the eight device-only keys", () => {
    expect([...DEVICE_SETTINGS_KEYS].sort()).toEqual(
      ["audioSinkId", "closeToTray", "downloadDir", "imageCacheMb", "libraryLayout", "localMusicFolder", "lyricsOffset", "sidebarLayout"].sort(),
    );
  });

  it("leaves the device keys out of the synced payload", () => {
    const synced = syncableSettings(useSettings.getState());
    for (const key of DEVICE_SETTINGS_KEYS) {
      expect(synced).not.toHaveProperty(key);
    }
    expect(synced).toHaveProperty("theme", "system");
    expect(synced).toHaveProperty("reduceAnimation", false);
    expect(synced).toHaveProperty("reduceDynamicBlur", false);
  });

  it("clamps and rounds the lyrics offset to 0.05 seconds", () => {
    expect(clampLyricsOffset(5)).toBe(3);
    expect(clampLyricsOffset(-9)).toBe(-3);
    expect(clampLyricsOffset(0.12)).toBe(0.1);
    expect(clampLyricsOffset(0.15)).toBe(0.15);
    useSettings.getState().setLyricsOffset(1.337);
    expect(useSettings.getState().lyricsOffset).toBe(1.35);
  });
});

describe("persistence", () => {
  it("writes changes to the settings store", () => {
    useSettings.getState().setTheme("light");
    expect(storage.value).toMatchObject({ state: { theme: "light" } });
  });

  it("restores the stored theme on hydrate", async () => {
    storage.value = { state: { theme: "system", reduceAnimation: true }, version: 0 };
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().theme).toBe("system");
    expect(useSettings.getState().reduceAnimation).toBe(true);
    expect(useSettings.getState().reduceDynamicBlur).toBe(false);
  });

  it.each(["dark", "light"] as const)("keeps a stored %s theme on hydrate", async (theme) => {
    storage.value = { state: { theme }, version: 0 };
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().theme).toBe(theme);
  });

  it.each([
    ["an unknown name", "neon"],
    ["a number", 3],
    ["an empty string", ""],
    ["null", null],
  ])("falls back to System when the stored theme is %s", async (_label, theme) => {
    storage.value = { state: { theme, reduceAnimation: true }, version: 0 };
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().theme).toBe("system");
    expect(useSettings.getState().reduceAnimation).toBe(true);
  });

  it("keeps the default for keys missing from the stored state", async () => {
    storage.value = { state: { theme: "light" }, version: 0 };
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().theme).toBe("light");
    expect(useSettings.getState().reduceAnimation).toBe(false);
    expect(useSettings.getState().closeToTray).toBe(true);
  });

  it("keeps device values out of the synced payload after they change", () => {
    const state = useSettings.getState();
    state.setDownloadDir("/music/downloads");
    state.setLocalMusicFolder("/music/library");
    state.setAudioSinkId("device-42");
    state.setLyricsOffset(1.5);
    state.setCloseToTray(false);

    const current = useSettings.getState();
    expect(current.downloadDir).toBe("/music/downloads");
    expect(current.localMusicFolder).toBe("/music/library");
    expect(current.audioSinkId).toBe("device-42");
    expect(current.lyricsOffset).toBe(1.5);
    expect(current.closeToTray).toBe(false);

    const synced = syncableSettings(current);
    for (const key of DEVICE_SETTINGS_KEYS) {
      expect(synced).not.toHaveProperty(key);
    }
  });

  it("syncs every other setting value", () => {
    const current = useSettings.getState();
    const expected = Object.keys(current).filter(
      (key) => !(DEVICE_SETTINGS_KEYS as readonly string[]).includes(key) && key !== "addonSources",
    );
    expect(Object.keys(syncableSettings(current)).sort()).toEqual(expected.sort());
  });
});

describe("appearance", () => {
  it("applies the stored theme to the page", () => {
    applyAppearance({ theme: "light", reduceAnimation: false, reduceDynamicBlur: false });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("updates the page as soon as a setting changes", () => {
    const unsubscribe = useSettings.subscribe(applyAppearance);
    try {
      useSettings.getState().setTheme("light");
      expect(document.documentElement.dataset.theme).toBe("light");
    } finally {
      unsubscribe();
    }
  });

  it("follows the desktop color scheme only while the theme is System", () => {
    setDesktopAppearance({ colorScheme: "dark", reduceMotion: false });
    try {
      applyAppearance({ theme: "system", reduceAnimation: false, reduceDynamicBlur: false });
      expect(document.documentElement.dataset.theme).toBe("dark");

      applyAppearance({ theme: "light", reduceAnimation: false, reduceDynamicBlur: false });
      expect(document.documentElement.dataset.theme).toBe("light");
    } finally {
      setDesktopAppearance(NO_DESKTOP_APPEARANCE);
    }
  });
});

describe("library layout default", () => {
  it("moves a saved list layout back to grid once, on the first load after this version", () => {
    const migrate = useSettings.persist.getOptions().migrate;
    const saved = { ...initial, libraryLayout: "list" as const };

    expect(migrate?.(saved, 1)).toMatchObject({ libraryLayout: "grid" });
    expect(migrate?.({ ...saved, libraryLayout: "list" }, 2)).toMatchObject({ libraryLayout: "list" });
  });
});

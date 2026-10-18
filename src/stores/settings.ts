import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";
import { applyTheme, type ThemeMode } from "../lib/theme";

export const DEVICE_SETTINGS_KEYS = [
  "downloadDir",
  "localMusicFolder",
  "audioSinkId",
  "lyricsOffset",
  "closeToTray",
] as const;

export const LYRICS_OFFSET_LIMIT = 3;
const LYRICS_OFFSET_STEPS_PER_SECOND = 20;

export type SettingsValues = {
  theme: ThemeMode;
  reduceAnimation: boolean;
  reduceDynamicBlur: boolean;
  downloadDir: string | null;
  localMusicFolder: string | null;
  audioSinkId: string;
  lyricsOffset: number;
  closeToTray: boolean;
};

export type SettingsState = SettingsValues & {
  setTheme: (value: ThemeMode) => void;
  setReduceAnimation: (value: boolean) => void;
  setReduceDynamicBlur: (value: boolean) => void;
  setDownloadDir: (value: string | null) => void;
  setLocalMusicFolder: (value: string | null) => void;
  setAudioSinkId: (value: string) => void;
  setLyricsOffset: (value: number) => void;
  setCloseToTray: (value: boolean) => void;
};

export function clampLyricsOffset(value: number) {
  const rounded = Math.round(value * LYRICS_OFFSET_STEPS_PER_SECOND) / LYRICS_OFFSET_STEPS_PER_SECOND;
  return Math.min(LYRICS_OFFSET_LIMIT, Math.max(-LYRICS_OFFSET_LIMIT, rounded));
}

export function syncableSettings(settings: SettingsValues): Partial<SettingsValues> {
  const result: Partial<SettingsValues> = { ...settings };
  for (const key of DEVICE_SETTINGS_KEYS) delete result[key];
  return result;
}

export function applyAppearance(
  settings: Pick<SettingsValues, "theme" | "reduceAnimation" | "reduceDynamicBlur">,
) {
  applyTheme(settings.theme);
  const root = document.documentElement;
  root.classList.toggle("reduce-motion", settings.reduceAnimation);
  root.classList.toggle("reduce-blur", settings.reduceDynamicBlur);
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      reduceAnimation: false,
      reduceDynamicBlur: false,
      downloadDir: null,
      localMusicFolder: null,
      audioSinkId: "",
      lyricsOffset: 0,
      closeToTray: true,
      setTheme: (value) => set({ theme: value }),
      setReduceAnimation: (value) => set({ reduceAnimation: value }),
      setReduceDynamicBlur: (value) => set({ reduceDynamicBlur: value }),
      setDownloadDir: (value) => set({ downloadDir: value }),
      setLocalMusicFolder: (value) => set({ localMusicFolder: value }),
      setAudioSinkId: (value) => set({ audioSinkId: value }),
      setLyricsOffset: (value) => set({ lyricsOffset: clampLyricsOffset(value) }),
      setCloseToTray: (value) => set({ closeToTray: value }),
    }),
    {
      name: "settings",
      storage: persistStorage<SettingsState>("settings"),
    },
  ),
);

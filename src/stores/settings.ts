import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";
import { type MatchLanguage } from "../lib/importLanguage";
import { type EqPreset, flatGains, normalizeEqGains, normalizeEqPresets } from "../lib/eq";
import { desktopAppearance } from "../lib/desktopAppearance";
import { DEFAULT_FONT, isAppFont, type AppFontId } from "../lib/fonts";
import { applyTheme, type ThemeMode } from "../lib/theme";
import { parseAddonSources } from "../lib/addons/registry";
import type { AddonSource } from "../lib/addons/types";
import { DEFAULT_IMAGE_CACHE_MB } from "../lib/cacheStats";

export const DEVICE_SETTINGS_KEYS = [
  "downloadDir",
  "localMusicFolder",
  "audioSinkId",
  "lyricsOffset",
  "closeToTray",
  "libraryLayout",
  "sidebarLayout",
  "imageCacheMb",
  "exclusiveOutput",
] as const;

export const LIBRARY_LAYOUTS = ["grid", "list"] as const;
export type LibraryLayout = (typeof LIBRARY_LAYOUTS)[number];

export const SIDEBAR_LAYOUTS = ["compact", "list", "grid"] as const;
export type SidebarLayout = (typeof SIDEBAR_LAYOUTS)[number];

export const LYRICS_OFFSET_LIMIT = 3;
const LYRICS_OFFSET_STEPS_PER_SECOND = 20;

export const CROSSFADE_LIMIT = 12;
export const PLAYBACK_SPEED_RANGE = [0.5, 2] as const;

export const STREAMING_QUALITIES = ["low", "medium", "high", "lossless"] as const;
export type StreamingQuality = (typeof STREAMING_QUALITIES)[number];
export const LOUDNESS_LEVELS = ["off", "quiet", "normal", "loud"] as const;
export type LoudnessLevel = (typeof LOUDNESS_LEVELS)[number];
export const DOWNLOAD_QUALITIES = ["standard", "high", "lossless"] as const;
export type DownloadQuality = (typeof DOWNLOAD_QUALITIES)[number];
export const LYRICS_TEXT_SIZES = ["small", "medium", "large"] as const;
export type LyricsTextSize = (typeof LYRICS_TEXT_SIZES)[number];

export const LYRICS_PROVIDERS = [
  { id: "betterLyrics", label: "BetterLyrics" },
  { id: "portato", label: "Portato" },
  { id: "paxsenix", label: "PaxSenix" },
  { id: "lrclib", label: "LRCLIB" },
  { id: "kugou", label: "KuGou" },
  { id: "simpmusic", label: "SimpMusic" },
  { id: "lyricsPlus", label: "LyricsPlus" },
  { id: "unison", label: "Unison" },
  { id: "youtubeCaptions", label: "Video captions" },
  { id: "genius", label: "Genius" },
] as const;

export type LyricsProviderId = (typeof LYRICS_PROVIDERS)[number]["id"];

export type SettingsValues = {
  theme: ThemeMode;
  reduceAnimation: boolean;
  reduceDynamicBlur: boolean;
  downloadDir: string | null;
  localMusicFolder: string | null;
  audioSinkId: string;
  exclusiveOutput: boolean;
  lyricsOffset: number;
  closeToTray: boolean;
  libraryLayout: LibraryLayout;
  sidebarLayout: SidebarLayout;
  crossfadeSeconds: number;
  smartFade: boolean;
  skipSilence: boolean;
  gaplessPlayback: boolean;
  autoplay: boolean;
  dontRepeatSuggestions: boolean;
  playbackSpeed: number;
  streamingQuality: StreamingQuality;
  mobileStreamingQuality: StreamingQuality;
  loudnessLevel: LoudnessLevel;
  syncedLyrics: boolean;
  blurUnfocusedLyrics: boolean;
  romanizeLyrics: boolean;
  fullBleedArtwork: boolean;
  animatedCovers: boolean;
  movingBackground: boolean;
  hideVolumeBar: boolean;
  filterNonMusicAudio: boolean;
  downloadQuality: DownloadQuality;
  exportDownloads: boolean;
  unlimitedSync: boolean;
  matchLanguage: MatchLanguage;
  eqEnabled: boolean;
  eqGains: number[];
  eqPresets: EqPreset[];
  eqAutoHeadroom: boolean;
  autoDownloadLiked: boolean;
  downloadWifiOnly: boolean;
  keepPlaylistsUpdated: boolean;
  imageCacheMb: number;
  zoom: number;
  pauseListeningHistory: boolean;
  pauseSearchHistory: boolean;
  noDuplicateQueue: boolean;
  restoreQueueOnRestart: boolean;
  homeSectionOrder: string[];
  hiddenHomeSections: string[];
  lyricsTextSize: LyricsTextSize;
  lyricsProviders: LyricsProviderId[];
  appFont: AppFontId;
  keepScreenAwake: boolean;
  dataSaver: boolean;
  jiosaavnEnabled: boolean;
  haptics: boolean;
  statsForNerds: boolean;
  autoUpdateCheck: boolean;
  addonSources: AddonSource[];
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
  setCrossfadeSeconds: (value: number) => void;
  setPlaybackSpeed: (value: number) => void;
  setEqGains: (value: number[]) => void;
  setValue: <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => void;
};

export function clampLyricsOffset(value: number) {
  const rounded = Math.round(value * LYRICS_OFFSET_STEPS_PER_SECOND) / LYRICS_OFFSET_STEPS_PER_SECOND;
  return Math.min(LYRICS_OFFSET_LIMIT, Math.max(-LYRICS_OFFSET_LIMIT, rounded));
}

export function toggleLyricsProvider(
  providers: LyricsProviderId[],
  id: LyricsProviderId,
): LyricsProviderId[] {
  return providers.includes(id)
    ? providers.filter((provider) => provider !== id)
    : [...providers, id];
}

export function clampCrossfadeSeconds(value: number) {
  return Math.min(CROSSFADE_LIMIT, Math.max(0, Math.round(value)));
}

export function clampPlaybackSpeed(value: number) {
  const [min, max] = PLAYBACK_SPEED_RANGE;
  const rounded = Math.round(value * 20) / 20;
  return Math.min(max, Math.max(min, rounded));
}

export function syncableSettings(settings: SettingsValues): Partial<SettingsValues> {
  const result: Partial<SettingsValues> = { ...settings };
  for (const key of DEVICE_SETTINGS_KEYS) delete result[key];
  delete result.addonSources;
  return result;
}

export function applyAppearance(
  settings: Pick<SettingsValues, "theme" | "reduceAnimation" | "reduceDynamicBlur">,
) {
  const desktop = desktopAppearance();
  applyTheme(settings.theme, desktop.colorScheme);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system";
}

function isLibraryLayout(value: unknown): value is LibraryLayout {
  return (LIBRARY_LAYOUTS as readonly unknown[]).includes(value);
}

function isSidebarLayout(value: unknown): value is SidebarLayout {
  return (SIDEBAR_LAYOUTS as readonly unknown[]).includes(value);
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
      exclusiveOutput: false,
      lyricsOffset: 0,
      closeToTray: true,
      libraryLayout: "grid",
      sidebarLayout: "list",
      crossfadeSeconds: 0,
      smartFade: false,
      skipSilence: false,
      gaplessPlayback: true,
      autoplay: true,
      dontRepeatSuggestions: false,
      playbackSpeed: 1,
      streamingQuality: "high",
      mobileStreamingQuality: "medium",
      loudnessLevel: "loud",
      syncedLyrics: true,
      blurUnfocusedLyrics: true,
      romanizeLyrics: false,
      fullBleedArtwork: true,
      animatedCovers: true,
      movingBackground: true,
      hideVolumeBar: false,
      filterNonMusicAudio: true,
      downloadQuality: "lossless",
      exportDownloads: false,
      unlimitedSync: false,
      matchLanguage: "",
      eqEnabled: false,
      eqGains: flatGains(),
      eqPresets: [],
      eqAutoHeadroom: true,
      autoDownloadLiked: false,
      downloadWifiOnly: false,
      keepPlaylistsUpdated: true,
      imageCacheMb: DEFAULT_IMAGE_CACHE_MB,
      zoom: 1,
      pauseListeningHistory: false,
      pauseSearchHistory: false,
      noDuplicateQueue: false,
      restoreQueueOnRestart: true,
      homeSectionOrder: [],
      hiddenHomeSections: [],
      lyricsTextSize: "medium",
      lyricsProviders: LYRICS_PROVIDERS.map((provider) => provider.id),
      appFont: DEFAULT_FONT,
      keepScreenAwake: false,
      dataSaver: false,
      jiosaavnEnabled: false,
      haptics: true,
      statsForNerds: false,
      autoUpdateCheck: true,
      addonSources: [],
      setCrossfadeSeconds: (value) => set({ crossfadeSeconds: clampCrossfadeSeconds(value) }),
      setPlaybackSpeed: (value) => set({ playbackSpeed: clampPlaybackSpeed(value) }),
      setEqGains: (value) => set({ eqGains: normalizeEqGains(value) }),
      setValue: (key, value) => set({ [key]: value } as Partial<SettingsValues>),
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
      version: 5,
      migrate: (persisted, version) => {
        const state = persisted as SettingsState;
        const libraryReset = version < 2 ? { ...state, libraryLayout: "grid" as const } : state;
        const sidebarReset = version < 3 ? { ...libraryReset, sidebarLayout: "list" as const } : libraryReset;
        if (version >= 5) return sidebarReset;
        const { rollHintOpens: _dropped, ...rest } = sidebarReset as SettingsState & { rollHintOpens?: number };
        return rest;
      },
      storage: persistStorage<SettingsState>("settings"),
      merge: (persisted, current) => {
        const stored = persisted as Partial<SettingsValues>;
        const theme = isThemeMode(stored.theme) ? stored.theme : current.theme;
        const libraryLayout = isLibraryLayout(stored.libraryLayout) ? stored.libraryLayout : current.libraryLayout;
        const sidebarLayout = isSidebarLayout(stored.sidebarLayout) ? stored.sidebarLayout : current.sidebarLayout;
        const eqGains = stored.eqGains === undefined ? current.eqGains : normalizeEqGains(stored.eqGains);
        const eqPresets = stored.eqPresets === undefined ? current.eqPresets : normalizeEqPresets(stored.eqPresets);
        const appFont = isAppFont(stored.appFont) ? stored.appFont : current.appFont;
        const addonSources = parseAddonSources(stored.addonSources) ?? current.addonSources;
        return { ...current, ...stored, theme, libraryLayout, sidebarLayout, eqGains, eqPresets, appFont, addonSources };
      },
    },
  ),
);

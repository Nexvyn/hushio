import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "../lib/persist";
import { isMatchLanguage, type MatchLanguage } from "../lib/importLanguage";
import { type EqPreset, flatGains, normalizeEqGains, normalizeEqPresets } from "../lib/eq";
import { desktopAppearance } from "../lib/desktopAppearance";
import { DEFAULT_FONT, isAppFont, type AppFontId } from "../lib/fonts";
import { applyTheme, type ThemeMode } from "../lib/theme";
import { parseAddonSources } from "../lib/addons/registry";
import type { AddonSource } from "../lib/addons/types";
import { DEFAULT_IMAGE_CACHE_MB } from "../lib/cacheStats";
import type { LanguageSetting } from "../lib/i18n";
import { ZOOM_STEPS } from "../lib/zoom";
import type { LibrarySort } from "../lib/librarySort";

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
  "language",
] as const;

export const LIBRARY_LAYOUTS = ["grid", "list"] as const;
export type LibraryLayout = (typeof LIBRARY_LAYOUTS)[number];

export const SIDEBAR_LAYOUTS = ["compact", "list", "grid"] as const;
export type SidebarLayout = (typeof SIDEBAR_LAYOUTS)[number];

export const LIBRARY_SORT_IDS: readonly LibrarySort[] = ["recents", "added", "alpha", "creator", "custom"];

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
  language: LanguageSetting;
  lyricsOffset: number;
  closeToTray: boolean;
  libraryLayout: LibraryLayout;
  sidebarLayout: SidebarLayout;
  sidebarSort: LibrarySort;
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

function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === "system" || value === "en" || value === "hi";
}

function isSidebarLayout(value: unknown): value is SidebarLayout {
  return (SIDEBAR_LAYOUTS as readonly unknown[]).includes(value);
}

type SettingCheck = (value: unknown) => boolean;

function numberIn(min: number, max = Number.POSITIVE_INFINITY): SettingCheck {
  return (value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function oneOf(values: readonly unknown[]): SettingCheck {
  return (value) => values.includes(value);
}

function listOf(check: SettingCheck): SettingCheck {
  return (value) => Array.isArray(value) && value.every(check);
}

function nullable(check: SettingCheck): SettingCheck {
  return (value) => value === null || check(value);
}

const isBoolean: SettingCheck = (value) => typeof value === "boolean";
const isString: SettingCheck = (value) => typeof value === "string";

const SETTING_CHECKS: Record<string, SettingCheck> = {
  theme: isThemeMode,
  reduceAnimation: isBoolean,
  reduceDynamicBlur: isBoolean,
  downloadDir: nullable(isString),
  localMusicFolder: nullable(isString),
  audioSinkId: isString,
  exclusiveOutput: isBoolean,
  language: isLanguageSetting,
  lyricsOffset: numberIn(-LYRICS_OFFSET_LIMIT, LYRICS_OFFSET_LIMIT),
  closeToTray: isBoolean,
  libraryLayout: isLibraryLayout,
  sidebarLayout: isSidebarLayout,
  sidebarSort: oneOf(LIBRARY_SORT_IDS),
  crossfadeSeconds: numberIn(0, CROSSFADE_LIMIT),
  smartFade: isBoolean,
  skipSilence: isBoolean,
  gaplessPlayback: isBoolean,
  autoplay: isBoolean,
  dontRepeatSuggestions: isBoolean,
  playbackSpeed: numberIn(...PLAYBACK_SPEED_RANGE),
  streamingQuality: oneOf(STREAMING_QUALITIES),
  mobileStreamingQuality: oneOf(STREAMING_QUALITIES),
  loudnessLevel: oneOf(LOUDNESS_LEVELS),
  syncedLyrics: isBoolean,
  blurUnfocusedLyrics: isBoolean,
  romanizeLyrics: isBoolean,
  fullBleedArtwork: isBoolean,
  animatedCovers: isBoolean,
  movingBackground: isBoolean,
  hideVolumeBar: isBoolean,
  filterNonMusicAudio: isBoolean,
  downloadQuality: oneOf(DOWNLOAD_QUALITIES),
  exportDownloads: isBoolean,
  unlimitedSync: isBoolean,
  matchLanguage: isMatchLanguage,
  eqEnabled: isBoolean,
  eqAutoHeadroom: isBoolean,
  autoDownloadLiked: isBoolean,
  downloadWifiOnly: isBoolean,
  keepPlaylistsUpdated: isBoolean,
  imageCacheMb: numberIn(0),
  zoom: numberIn(Math.min(...ZOOM_STEPS), Math.max(...ZOOM_STEPS)),
  pauseListeningHistory: isBoolean,
  pauseSearchHistory: isBoolean,
  noDuplicateQueue: isBoolean,
  restoreQueueOnRestart: isBoolean,
  homeSectionOrder: listOf(isString),
  hiddenHomeSections: listOf(isString),
  lyricsTextSize: oneOf(LYRICS_TEXT_SIZES),
  lyricsProviders: listOf(oneOf(LYRICS_PROVIDERS.map((provider) => provider.id))),
  appFont: isAppFont,
  keepScreenAwake: isBoolean,
  dataSaver: isBoolean,
  jiosaavnEnabled: isBoolean,
  haptics: isBoolean,
  statsForNerds: isBoolean,
  autoUpdateCheck: isBoolean,
};

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
      language: "system",
      lyricsOffset: 0,
      closeToTray: true,
      libraryLayout: "grid",
      sidebarLayout: "list",
      sidebarSort: "recents",
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
        const merged = { ...current, ...stored } as Record<string, unknown>;
        for (const [key, check] of Object.entries(SETTING_CHECKS)) {
          if (!check(merged[key])) merged[key] = current[key as keyof SettingsValues];
        }
        const eqGains = stored.eqGains === undefined ? current.eqGains : normalizeEqGains(stored.eqGains);
        const eqPresets = stored.eqPresets === undefined ? current.eqPresets : normalizeEqPresets(stored.eqPresets);
        const addonSources = parseAddonSources(stored.addonSources) ?? current.addonSources;
        return { ...merged, eqGains, eqPresets, addonSources } as SettingsState;
      },
    },
  ),
);

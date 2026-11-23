import { LANGUAGES, t } from "../../lib/i18n";
import { VinylRecord, Warning, ChartBar, Waveform, ChartLine, CloudArrowDown, Cloud, Copy, Gauge, Database, Trash, DownloadSimple, Drop, Export, FileArrowDown, FunnelSimple, Flashlight, Lightning, FolderPlus, FolderSimple, FolderOpen, CornersOut, GameController, Globe, Infinity, Info, LinkSimple, SignOut, ArrowsOut, DeviceMobile, List, Microphone, MusicNote, PaintBrush, PlayCircle, Radio, ArrowClockwise, Repeat, SidebarSimple, SlidersHorizontal, Sparkle, SpeakerHigh, TextT, Timer, Translate, User, VideoCamera, SpeakerX, WifiHigh, CircleHalf, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { ThemeMode } from "../../lib/theme";
import { Button } from "../../components/Button";
import { AboutHeader, AboutMaker, GITHUB_URL, WEBSITE_URL } from "./AboutSettings";
import { Equalizer } from "../../components/Equalizer";
import { AndroidUpdateControl } from "./AndroidUpdateControl";
import { GoogleAccountCard } from "../../components/GoogleAccountCard";
import { OutputDevicePicker } from "../../components/OutputDevicePicker";
import { RadioGroup, type RadioOption } from "../../components/RadioGroup";
import type { SettingRowProps } from "../../components/SettingRow";
import { YouTubeMusicPrompt } from "../../components/YouTubeMusicPrompt";
import { Slider } from "../../components/Slider";
import { APP_NAME, APP_SLUG } from "../../lib/app";
import type { GoogleAccount, Platform, YtSyncStatus, YtTvCode } from "../../lib/bridge";
import { APP_FONTS, isAppFont } from "../../lib/fonts";
import { deviceNoun } from "../../lib/desktopPlatform";
import { DOWNLOAD_PAGE, RELEASES_PAGE, actionLabel, updateCopy, type UpdateState } from "../../lib/updates";
import { MATCH_LANGUAGE_OPTIONS } from "../../lib/importLanguage";
import { failedText, quotaText, syncStatusText } from "../../lib/ytSync";
import { chooseDownloadFolder } from "../../lib/downloads";
import { confirmImportBackup, exportBackup } from "../../lib/importBackup";
import { useErase } from "../../stores/erase";
import { useLocalLibrary } from "../../stores/localLibrary";
import type { View } from "../../stores/navigation";
import { scrobbleRows, type ScrobbleContext } from "./scrobble";
import { discordNote, type DiscordContext } from "./discord";
import type {
  DownloadQuality,
  LoudnessLevel,
  LyricsTextSize,
  SettingsState,
  SettingsValues,
  StreamingQuality,
} from "../../stores/settings";
import { LYRICS_PROVIDERS, toggleLyricsProvider } from "../../stores/settings";

export const CATEGORY_IDS = [
  "account",
  "playback",
  "sound",
  "lyrics",
  "display",
  "library",
  "scrobbling",
  "data",
  "about",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];
export type RowSpec = SettingRowProps & { id: string };

export type SettingsGroup = {
  title?: string;
  note?: string;
  rows: RowSpec[];
  body?: ReactNode;
  plain?: boolean;
};

export type SettingsCategory = {
  id: CategoryId;
  label: string;
  icon: PhosphorIcon;
  groups: SettingsGroup[];
};

type AuthContext = {
  account: GoogleAccount;
  signingIn: boolean;
  signIn: () => void;
  cancelSignIn: () => void;
  requestSignOut: () => void;
};

type TvContext = {
  connected: boolean;
  code: YtTvCode | null;
  busy: boolean;
  error: string | null;
  connect: () => void;
  cancel: () => void;
  open: () => void;
  disconnect: () => void;
};

type SyncContext = {
  status: YtSyncStatus;
  syncNow: () => void;
  tv: TvContext;
};

type UpdatesContext = {
  state: UpdateState;
  check: () => void;
  install: () => void;
  restart: () => void;
  openPage: (url: string) => void;
};

export type BuildContext = {
  settings: SettingsState;
  version: string | null;
  platform: Platform;
  navigate: (view: View) => void;
  auth: AuthContext;
  updates: UpdatesContext;
  sync: SyncContext;
  scrobble?: ScrobbleContext;
  discord?: DiscordContext;
  nativeAudio?: boolean;
};

type BooleanKey = {
  [K in keyof SettingsValues]-?: SettingsValues[K] extends boolean ? K : never;
}[keyof SettingsValues];

const UNLIMITED_SYNC_NOTE =
  "Unofficial. Uses YouTube web calls for every change. It can stop working, and it can put your Google account at risk. Off uses the official YouTube API, and switches to the unofficial calls only when the daily quota runs out.";

const STREAMING_OPTIONS: RadioOption<StreamingQuality>[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "lossless", label: "Lossless" },
];

const LOUDNESS_OPTIONS: RadioOption<LoudnessLevel>[] = [
  { value: "off", label: "Off" },
  { value: "quiet", label: "Quiet" },
  { value: "normal", label: "Normal" },
  { value: "loud", label: "Loud" },
];

const DOWNLOAD_OPTIONS: RadioOption<DownloadQuality>[] = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "High" },
  { value: "lossless", label: "Lossless" },
];

const THEME_OPTIONS: RadioOption<ThemeMode>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LYRICS_SIZE_OPTIONS: RadioOption<LyricsTextSize>[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function flag(settings: SettingsState, key: BooleanKey) {
  return {
    checked: settings[key],
    onChange: (value: boolean) => settings.setValue(key, value),
  };
}

function formatSpeed(speed: number) {
  return `${Number(speed.toFixed(2))}x`;
}

function formatLyricsShift(offset: number) {
  if (offset === 0) return "In sync";
  const amount = Number(Math.abs(offset).toFixed(2));
  return `${amount} s ${offset > 0 ? "later" : "earlier"}`;
}

function crossfadeValue(settings: SettingsState) {
  if (settings.crossfadeSeconds > 0) return `${settings.crossfadeSeconds}s`;
  return settings.smartFade ? "Auto" : "Off";
}

function tvRows(visible: boolean, tv: TvContext): RowSpec[] {
  if (!visible) return [];
  if (tv.connected) {
    return [
      {
        id: "tv-disconnect",
        icon: SignOut,
        title: "Disconnect YouTube account",
        control: <Button onClick={tv.disconnect}>Disconnect</Button>,
      },
    ];
  }
  return [
    {
      id: "tv-connect",
      icon: LinkSimple,
      title: "Connect YouTube account",
      control: (
        <Button disabled={tv.busy} onClick={tv.connect}>
          Connect
        </Button>
      ),
    },
  ];
}

const DANGER_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-[8px] bg-danger px-4 text-body font-medium text-on-danger motion-safe:transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function accountCategory({ settings: s, auth, sync, platform }: BuildContext): SettingsCategory {
  const device = deviceNoun(platform);
  const signedIn = auth.account.mode === "google";
  const running = sync.status.state === "running";
  const syncNote = [
    syncStatusText(sync.status, Date.now()),
    sync.status.failedJobs > 0 ? failedText(sync.status.failedJobs) : null,
  ]
    .filter(Boolean)
    .join(" ");
  const keyringNote = auth.account.keyringAvailable
    ? undefined
    : `No keyring found, so ${APP_NAME} can't keep you signed in. Install GNOME Keyring or KWallet, then sign in again.`;
  const firstGroup: SettingsGroup = signedIn
    ? {
        note: keyringNote,
        rows: [],
        body: (
          <GoogleAccountCard
            account={auth.account}
            signingIn={auth.signingIn}
            onSignIn={auth.signIn}
            onCancelSignIn={auth.cancelSignIn}
          />
        ),
      }
    : auth.account.configured
      ? {
          note: keyringNote,
          rows: [
            {
              id: "sign-in",
              icon: User,
              title: "Sign in with Google",
              note: auth.signingIn
                ? "Waiting for Google…"
                : `Syncs your playlists and Liked Songs to your YouTube account. Everything else stays on this ${device}.`,
              control: auth.signingIn ? (
                <Button variant="ghost" onClick={auth.cancelSignIn}>
                  Cancel
                </Button>
              ) : (
                <Button variant="primary" onClick={auth.signIn}>
                  Sign in
                </Button>
              ),
            },
          ],
        }
      : {
          note: keyringNote,
          rows: [
            {
              id: "guest",
              icon: User,
              title: `Using ${APP_NAME} as a guest`,
              note: `Your library stays on this ${device}. Google sign-in isn't available in this build.`,
            },
          ],
        };

  const groups: SettingsGroup[] = [firstGroup];
  if (signedIn) {
    groups.push({
      title: "Sync",
      note: syncNote,
      rows: [
        {
          id: "sync-now",
          icon: ArrowClockwise,
          title: "Sync now",
          note: quotaText(sync.status),
          disabled: running,
          control: (
            <Button disabled={running} onClick={sync.syncNow}>
              Sync now
            </Button>
          ),
        },
        {
          id: "unlimited-sync",
          icon: Infinity,
          title: "Unlimited sync (unofficial)",
          note: UNLIMITED_SYNC_NOTE,
          toggle: flag(s, "unlimitedSync"),
        },
        ...tvRows(s.unlimitedSync, sync.tv),
      ],
    });
    if (s.unlimitedSync && (sync.tv.code || sync.tv.error || sync.tv.busy)) {
      groups.push({
        rows: [],
        body: (
          <YouTubeMusicPrompt
            code={sync.tv.code}
            busy={sync.tv.busy}
            error={sync.tv.error}
            onOpen={sync.tv.open}
            onCancel={sync.tv.cancel}
          />
        ),
      });
    }
    groups.push({
      rows: [
        {
          id: "sign-out",
          icon: SignOut,
          title: "Sign out",
          note: `Sync stops. Your data stays on this ${device} and in your Google account.`,
          control: <Button onClick={auth.requestSignOut}>Sign out</Button>,
        },
      ],
    });
  }
  groups.push({
    rows: [
      {
        id: "disconnect-erase",
        icon: Trash,
        title: signedIn ? "Disconnect & erase" : "Erase all local data",
        note: signedIn
          ? `Removes this ${device}'s Google sign-in and erases ${APP_NAME}'s data on this ${device}. Your YouTube playlists and Liked Songs are kept unless you choose otherwise.`
          : `Deletes everything ${APP_NAME} stores on this ${device}. This can't be undone.`,
        danger: true,
        control: (
          <button
            type="button"
            onClick={() => useErase.getState().open(signedIn ? "google" : "guest")}
            className={DANGER_BUTTON}
          >
            {signedIn ? "Disconnect & erase" : "Erase"}
          </button>
        ),
      },
    ],
  });

  return {
    id: "account",
    label: "Account",
    icon: User,
    groups,
  };
}

function playbackCategory(context: BuildContext): SettingsCategory {
  const { settings: s, platform } = context;
  const rows: RowSpec[] = [
    {
      id: "crossfade",
      icon: ChartLine,
      title: t("settings.row.crossfade"),
      note: "Blends the end of a track into the next.",
      value: crossfadeValue(s),
      control: (
        <Slider
          label="Crossfade"
          min={0}
          max={12}
          step={1}
          value={s.crossfadeSeconds}
          onChange={s.setCrossfadeSeconds}
        />
      ),
    },
    {
      id: "automix",
      icon: Sparkle,
      title: t("settings.row.automix"),
      note: s.smartFade
        ? "Blends where the music really ends and lines up beats when tempos match"
        : "Off: blends use the crossfade length above",
      toggle: flag(s, "smartFade"),
    },
    {
      id: "gapless",
      icon: Waveform,
      title: t("settings.row.gapless"),
      note: "Plays the next song without a gap. Turns off when crossfade is on.",
      disabled: s.crossfadeSeconds > 0,
      toggle: flag(s, "gaplessPlayback"),
    },
    {
      id: "skip-silence",
      icon: SpeakerX,
      title: t("settings.row.skipSilence"),
      note: "Skips silence at the start and end of songs.",
      toggle: flag(s, "skipSilence"),
    },
    {
      id: "jiosaavn-catalogue",
      icon: MusicNote,
      title: "JioSaavn catalogue",
      note: "Unofficial. Adds JioSaavn songs to search and plays them alongside the current source.",
      toggle: flag(s, "jiosaavnEnabled"),
    },
    {
      id: "autoplay",
      icon: Infinity,
      title: t("settings.row.autoplay"),
      note: "When songs run out, keep playing similar music.",
      toggle: flag(s, "autoplay"),
    },
    {
      id: "no-repeat-suggestions",
      icon: Repeat,
      title: t("settings.row.noRepeat"),
      note: "Keeps recently played tracks out of the home feed.",
      toggle: flag(s, "dontRepeatSuggestions"),
    },
    {
      id: "no-duplicate-queue",
      icon: Copy,
      title: t("settings.row.noDuplicates"),
      note: "A song you already have in the queue is left out.",
      toggle: flag(s, "noDuplicateQueue"),
    },
    {
      id: "restore-queue",
      icon: ArrowClockwise,
      title: t("settings.row.restoreQueue"),
      note: "Picks up where you left off, with the same song and position.",
      toggle: flag(s, "restoreQueueOnRestart"),
    },
    {
      id: "playback-speed",
      icon: Gauge,
      title: t("settings.row.speed"),
      note: "Pitch-preserving tempo.",
      value: formatSpeed(s.playbackSpeed),
      control: (
        <Slider
          label="Playback speed"
          min={0.5}
          max={2}
          step={0.05}
          value={s.playbackSpeed}
          onChange={s.setPlaybackSpeed}
        />
      ),
    },
  ];

  if (platform === "windows") {
    rows.push({
      id: "close-to-tray",
      icon: SidebarSimple,
      title: t("settings.row.closeToTray"),
      note: "Closing the window pauses music. Quit from the tray icon.",
      toggle: flag(s, "closeToTray"),
    });
  }

  rows.push({
    id: "stats-for-nerds",
    icon: ChartBar,
    title: "Stats for nerds",
    note: "Shows codec, bitrate, sample rate and source under Now Playing.",
    toggle: flag(s, "statsForNerds"),
  });

  rows.push({
    id: "song-versions",
    icon: Translate,
    title: "Song versions",
    note: "When a song has versions in several languages, imports and playlists pick this one.",
    stacked: true,
    control: (
      <RadioGroup
        label="Song versions"
        options={MATCH_LANGUAGE_OPTIONS}
        value={s.matchLanguage}
        onChange={(value) => s.setValue("matchLanguage", value)}
      />
    ),
  });

  return {
    id: "playback",
    label: t("settings.category.playback"),
    icon: PlayCircle,
    groups: [{ rows }],
  };
}

function outputRow({ settings: s, platform }: BuildContext): RowSpec {
  if (platform === "windows") {
    return {
      id: "output-device",
      icon: SpeakerHigh,
      title: t("settings.row.outputDevice"),
      note: s.audioSinkId ? "Pinned to this device" : "Following the system default",
      control: <OutputDevicePicker />,
    };
  }
  if (platform === "macos") {
    return { id: "output-device", icon: SpeakerHigh, title: t("settings.row.outputDevice"), note: "Follows the system output" };
  }
  return { id: "output-device", icon: SpeakerHigh, title: t("settings.row.outputDevice"), note: "Follows the system output", disabled: true };
}

function soundCategory(context: BuildContext): SettingsCategory {
  const { settings: s } = context;
  return {
    id: "sound",
    label: t("settings.category.sound"),
    icon: Waveform,
    groups: [
      {
        rows: [
          {
            id: "streaming-quality",
            icon: WifiHigh,
            title: t("settings.row.wifiQuality"),
            note: "Streaming quality on Wi-Fi.",
            control: (
              <RadioGroup
                label="Wi-Fi quality"
                options={STREAMING_OPTIONS}
                value={s.streamingQuality}
                onChange={(value) => s.setValue("streamingQuality", value)}
              />
            ),
          },
          ...(context.platform === "android"
            ? [
                {
                  id: "mobile-streaming-quality",
                  icon: DeviceMobile,
                  title: t("settings.row.mobileQuality"),
                  note: "Streaming quality on cellular networks.",
                  control: (
                    <RadioGroup
                      label="Mobile data quality"
                      options={STREAMING_OPTIONS}
                      value={s.mobileStreamingQuality}
                      onChange={(value) => s.setValue("mobileStreamingQuality", value)}
                    />
                  ),
                },
              ]
            : []),
          {
            id: "volume-leveling",
            icon: SpeakerHigh,
            title: t("settings.row.volumeLeveling"),
            note: "Brings every song to a similar loudness.",
            control: (
              <RadioGroup
                label="Volume leveling"
                options={LOUDNESS_OPTIONS}
                value={s.loudnessLevel}
                onChange={(value) => s.setValue("loudnessLevel", value)}
              />
            ),
          },
          outputRow(context),
          ...(context.nativeAudio
            ? [
                {
                  id: "exclusive-output",
                  icon: Lightning,
                  title: t("settings.row.exclusiveOutput"),
                  note: "Sends audio straight to the device. The equalizer, volume leveling and crossfade are off while it is on.",
                  toggle: flag(s, "exclusiveOutput"),
                },
              ]
            : []),
        ],
      },
      {
        rows: [
          {
            id: "equalizer",
            icon: SlidersHorizontal,
            title: t("settings.row.equalizer"),
            note: "Shape the sound with 10 bands",
            toggle: flag(s, "eqEnabled"),
          },
        ],
        body: <Equalizer />,
      },
      {
        rows: [
          {
            id: "prevent-clipping",
            icon: Warning,
            title: t("settings.row.preventClipping"),
            note: "Lowers the level only when your boosts would distort at the current volume",
            disabled: !s.eqEnabled,
            toggle: flag(s, "eqAutoHeadroom"),
          },
        ],
      },
    ],
  };
}

function lyricsCategory({ settings: s }: BuildContext): SettingsCategory {
  const syncedOff = !s.syncedLyrics;
  return {
    id: "lyrics",
    label: t("settings.category.lyrics"),
    icon: Microphone,
    groups: [
      {
        rows: [
          {
            id: "synced-lyrics",
            icon: Microphone,
            title: t("settings.row.syncedLyrics"),
            note: "Highlights the current line and auto-scrolls.",
            toggle: flag(s, "syncedLyrics"),
          },
        ],
      },
      {
        note: syncedOff
          ? "Blur, romanized lyrics and timing work while synced lyrics are on."
          : undefined,
        rows: [
          {
            id: "blur-lyrics",
            icon: Drop,
            title: t("settings.row.blurLyrics"),
            note: "Keeps the spotlight on the current line.",
            toggle: flag(s, "blurUnfocusedLyrics"),
            disabled: syncedOff,
          },
          {
            id: "romanized-lyrics",
            icon: Translate,
            title: t("settings.row.romanized"),
            note: "Shows a Latin-letter reading under lyrics in other scripts (Hindi, Telugu, Korean).",
            toggle: flag(s, "romanizeLyrics"),
            disabled: syncedOff,
          },
          {
            id: "lyrics-timing",
            icon: Timer,
            title: t("settings.row.timing"),
            note: "Shifts lyrics for this device.",
            value: formatLyricsShift(s.lyricsOffset),
            disabled: syncedOff,
            control: (
              <Slider
                label="Lyrics timing"
                min={-3}
                max={3}
                step={0.25}
                value={s.lyricsOffset}
                onChange={s.setLyricsOffset}
                disabled={syncedOff}
              />
            ),
          },
          {
            id: "lyrics-text-size",
            icon: TextT,
            title: t("settings.row.textSize"),
            note: "How big the lyrics are.",
            control: (
              <RadioGroup
                label="Lyrics text size"
                options={LYRICS_SIZE_OPTIONS}
                value={s.lyricsTextSize}
                onChange={(value) => s.setValue("lyricsTextSize", value)}
              />
            ),
          },
        ],
      },
      {
        title: t("settings.row.sources"),
        note: "Hushio asks each source in turn and takes the first answer that has timings.",
        rows: LYRICS_PROVIDERS.map((provider) => ({
          id: `lyrics-provider-${provider.id}`,
          icon: Microphone,
          title: provider.label,
          toggle: {
            checked: s.lyricsProviders.includes(provider.id),
            onChange: () =>
              s.setValue("lyricsProviders", toggleLyricsProvider(s.lyricsProviders, provider.id)),
          },
        })),
      },
    ],
  };
}

function displayCategory(context: BuildContext): SettingsCategory {
  const { settings: s, navigate } = context;
  return {
    id: "display",
    label: t("settings.category.display"),
    icon: PaintBrush,
    groups: [
      {
        rows: [
          {
            id: "theme",
            icon: CircleHalf,
            title: t("settings.row.theme"),
            note: "System follows your device's light or dark setting.",
            control: (
              <RadioGroup
                label="Theme"
                options={THEME_OPTIONS}
                value={s.theme}
                onChange={(value) => s.setTheme(value)}
              />
            ),
          },
          {
            id: "language",
            icon: Translate,
            title: t("settings.language"),
            note: t("settings.languageNote"),
            control: (
              <select
                aria-label={t("settings.language")}
                value={s.language}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "system" || value === "en" || value === "hi") s.setValue("language", value);
                }}
                className="hit-area h-9 rounded-control border border-separator bg-base px-2.5 text-meta text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <option value="system">{t("settings.languageSystem")}</option>
                {LANGUAGES.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.nativeName}
                  </option>
                ))}
              </select>
            ),
          },
          {
            id: "reduce-animation",
            icon: ArrowsOut,
            title: t("settings.row.reduceAnimation"),
            note: "Cuts crossfades and motion through the app.",
            toggle: flag(s, "reduceAnimation"),
          },
          ...(context.platform === "android"
            ? [
                {
                  id: "vibration-feedback",
                  icon: DeviceMobile,
                  title: t("settings.row.vibration"),
                  note: "A light tick on taps, likes and song changes.",
                  toggle: flag(s, "haptics"),
                },
              ]
            : []),
          {
            id: "reduce-transparency",
            icon: Drop,
            title: t("settings.row.reduceTransparency"),
            note: "Turns off the light blur on menus and popovers.",
            toggle: flag(s, "reduceDynamicBlur"),
          },
          {
            id: "full-bleed-artwork",
            icon: CornersOut,
            title: t("settings.row.fullBleed"),
            note: "Lets the artwork bleed behind the status area.",
            toggle: flag(s, "fullBleedArtwork"),
          },
          {
            id: "animated-covers",
            icon: VideoCamera,
            title: t("settings.row.animatedCovers"),
            note: "Loops a short video over the cover when one exists. Off with data saver or reduced motion.",
            toggle: flag(s, "animatedCovers"),
          },
          {
            id: "hide-volume-bar",
            icon: SpeakerHigh,
            title: t("settings.row.hideVolume"),
            note: "Keeps the player bar free of the volume slider.",
            toggle: flag(s, "hideVolumeBar"),
          },
          {
            id: "keep-screen-awake",
            icon: Flashlight,
            title: t("settings.row.keepAwake"),
            note: "Stops the screen going dark while Now Playing is open.",
            toggle: flag(s, "keepScreenAwake"),
          },
          {
            id: "data-saver",
            icon: WifiHigh,
            title: t("settings.row.dataSaver"),
            note: "Streams the lowest quality and loads smaller covers.",
            toggle: flag(s, "dataSaver"),
          },
          {
            id: "app-font",
            icon: TextT,
            title: t("settings.row.appFont"),
            note: "The font used for UI text and lyrics.",
            control: (
              <RadioGroup
                label="App font"
                options={APP_FONTS.map((font) => ({ value: font.id, label: font.label }))}
                value={s.appFont}
                onChange={(value) => {
                  if (isAppFont(value)) s.setValue("appFont", value);
                }}
              />
            ),
          },
          {
            id: "home-sections",
            icon: List,
            title: t("settings.row.homeSections"),
            note: "Reorder the sections on Home, or hide one.",
            control: <Button onClick={() => navigate({ name: "settings", param: "home-sections" })}>Open</Button>,
          },
        ],
      },
      ...(context.discord
        ? [
            {
              title: "Discord",
              note: discordNote(context.discord.status),
              rows: [
                {
                  id: "discord-rich-presence",
                  icon: GameController,
                  title: "Show what I'm playing in Discord",
                  note: context.discord.status.connected
                    ? "Discord is running and listening."
                    : "Discord isn't running right now. This turns on by itself when it starts.",
                  disabled: !context.discord.status.available,
                  toggle: {
                    checked: context.discord.status.enabled,
                    onChange: (value: boolean) => context.discord?.setEnabled(value),
                  },
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function libraryCategory(context: BuildContext): SettingsCategory {
  const { settings: s, navigate } = context;
  return {
    id: "library",
    label: t("settings.category.library"),
    icon: VinylRecord,
    groups: [
      {
        rows: [
          {
            id: "local-folders",
            icon: FolderOpen,
            title: t("settings.row.localFolders"),
            note: s.localMusicFolder ? "Your imported collections" : "No folders imported yet",
            control: (
              <Button onClick={() => navigate({ name: "local" })}>Open</Button>
            ),
          },
          {
            id: "add-folder",
            icon: FolderPlus,
            title: t("settings.row.addFolder"),
            note: "Import music folders. A parent folder brings its music subfolders along",
            control: <Button onClick={() => void useLocalLibrary.getState().importFromPicker()}>Add folder</Button>,
          },
          {
            id: "rescan-library",
            icon: ArrowClockwise,
            title: t("settings.row.rescan"),
            note: "Re-read tags and artwork from every imported folder",
            control: <Button onClick={() => void useLocalLibrary.getState().scan()}>Rescan</Button>,
          },
          {
            id: "filter-non-music",
            icon: FunnelSimple,
            title: t("settings.row.filterNonMusic"),
            note: "Hides clips, recordings and voice notes. Applies on rescan.",
            toggle: flag(s, "filterNonMusicAudio"),
          },
          {
            id: "auto-download-liked",
            icon: CloudArrowDown,
            title: t("settings.row.autoDownload"),
            note: "Saves a copy of every song you like.",
            toggle: flag(s, "autoDownloadLiked"),
          },
          {
            id: "keep-playlists-updated",
            icon: ArrowClockwise,
            title: t("settings.row.keepPlaylists"),
            note: "Downloads new songs added to a playlist you have fully downloaded.",
            toggle: flag(s, "keepPlaylistsUpdated"),
          },
        ],
      },
      {
        rows: [
          {
            id: "download-folder",
            icon: FolderSimple,
            title: t("settings.row.downloadFolder"),
            note: s.downloadDir ?? `Default: your system Downloads folder / ${APP_NAME}`,
            control: <Button onClick={() => void chooseDownloadFolder()}>Choose</Button>,
          },
          {
            id: "download-quality",
            icon: DownloadSimple,
            title: t("settings.row.downloadQuality"),
            note: "What a saved track costs on disk",
            control: (
              <RadioGroup
                label="Download quality"
                options={DOWNLOAD_OPTIONS}
                value={s.downloadQuality}
                onChange={(value) => s.setValue("downloadQuality", value)}
              />
            ),
          },
          ...(context.platform === "android"
            ? [
                {
                  id: "download-wifi-only",
                  icon: WifiHigh,
                  title: t("settings.row.wifiOnly"),
                  note: "On mobile data, downloads wait in the list until you are on Wi-Fi.",
                  toggle: flag(s, "downloadWifiOnly"),
                },
              ]
            : []),
          {
            id: "export-downloads",
            icon: Export,
            title: t("settings.row.exportDownloads"),
            note: `Also save them into your Music library (Music/${APP_NAME}), so other players can use the files. Otherwise downloads stay in the folder above`,
            value: s.exportDownloads ? `Music/${APP_NAME}` : undefined,
            toggle: flag(s, "exportDownloads"),
          },
        ],
      },
      {
        title: "Network folders",
        note: `Play the music on a WebDAV or SMB server. The password stays on this ${deviceNoun(context.platform)}.`,
        rows: [
          {
            id: "network-servers",
            icon: Cloud,
            title: "Network folders",
            note: "Add a server and its songs appear under Local music.",
            control: (
              <Button onClick={() => navigate({ name: "settings", param: "network-servers" })}>Open</Button>
            ),
          },
        ],
      },
      {
        title: "Add-on sources",
        note: "Third-party add-ons that can supply lossless audio. Each one sees the songs you play.",
        rows: [
          {
            id: "addon-sources",
            icon: LinkSimple,
            title: "Add-on sources",
            note: "Add, test and order the add-ons Hushio tries for lossless audio.",
            control: <Button onClick={() => navigate({ name: "settings", param: "add-on-sources" })}>Open</Button>,
          },
        ],
      },
    ],
  };
}

function scrobblingCategory(context: BuildContext): SettingsCategory {
  return {
    id: "scrobbling",
    label: "Scrobbling",
    icon: Radio,
    groups: [
      {
        note: "A scrobble is sent once a song is halfway through, or after four minutes.",
        rows: context.scrobble ? scrobbleRows(context.scrobble) : [],
      },
    ],
  };
}

function dataCategory(context: BuildContext): SettingsCategory {
  const { settings: s } = context;
  return {
    id: "data",
    label: "Your data",
    icon: Database,
    groups: [
      {
        rows: [
          {
            id: "pause-listening-history",
            icon: Timer,
            title: "Pause listening history",
            note: "Stops recording what you play, in the stats and in the recent list.",
            toggle: flag(s, "pauseListeningHistory"),
          },
          {
            id: "pause-search-history",
            icon: FunnelSimple,
            title: "Pause search history",
            note: "Stops keeping the searches you make.",
            toggle: flag(s, "pauseSearchHistory"),
          },
        ],
      },
      {
        rows: [
          {
            id: "export-data",
            icon: Export,
            title: "Export data",
            note: "Write a backup of your library and history",
            control: <Button onClick={() => exportBackup()}>Export</Button>,
          },
          {
            id: "import-data",
            icon: FileArrowDown,
            title: "Import data",
            note: "Restore a backup, replacing what's here",
            control: <Button onClick={confirmImportBackup}>Import</Button>,
          },
          {
            id: "reset-app-data",
            icon: Trash,
            title: "Reset app data (local)",
            note: "Erase library, playlists, history and settings on this device. Downloads and YouTube data are kept.",
            danger: true,
            control: (
              <button type="button" onClick={() => useErase.getState().open("reset")} className={DANGER_BUTTON}>
                Reset
              </button>
            ),
          },
        ],
      },
    ],
  };
}

function updateControl({ state, check, install, restart, openPage }: UpdatesContext): ReactNode {
  switch (state.status) {
    case "available":
      if (state.route === "flathub") return undefined;
      return (
        <>
          {state.route === "inApp" && (
            <Button variant="ghost" onClick={() => openPage(RELEASES_PAGE)}>
              Release notes
            </Button>
          )}
          <Button variant="primary" onClick={() => install()}>
            {actionLabel(state.route)}
          </Button>
        </>
      );
    case "ready":
      return (
        <Button variant="primary" onClick={() => restart()}>
          Restart to update
        </Button>
      );
    case "downloading":
      return undefined;
    case "checking":
      return <Button disabled>Check for updates</Button>;
    default:
      if (state.route === "flathub") return undefined;
      return <Button onClick={() => check()}>Check for updates</Button>;
  }
}

function aboutCategory({ settings: s, version, updates, platform, navigate }: BuildContext): SettingsCategory {
  const android = platform === "android";
  const copy = updateCopy(updates.state);
  return {
    id: "about",
    label: "About",
    icon: Info,
    groups: [
      { rows: [], body: <AboutHeader version={version} />, plain: true },
      { title: "About the maker", rows: [], body: <AboutMaker onOpen={() => updates.openPage(GITHUB_URL)} onWebsite={() => updates.openPage(WEBSITE_URL)} /> },
      {
        rows: [
          {
            id: "updates",
            icon: CloudArrowDown,
            title: android ? "Updates" : copy.title,
            note: android ? undefined : copy.note,
            control: android ? <AndroidUpdateControl current={version} /> : updateControl(updates),
          },
          ...(android
            ? [
                {
                  id: "auto-update-check",
                  icon: ArrowClockwise,
                  title: "Check for updates automatically",
                  note: "Checks about once a day while the app is open.",
                  toggle: flag(s, "autoUpdateCheck"),
                },
              ]
            : []),
          {
            id: "website",
            icon: Globe,
            title: `${APP_NAME} website`,
            note: `${APP_SLUG}.nexvyn.dev: downloads, news and help`,
            control: <Button onClick={() => updates.openPage(DOWNLOAD_PAGE)}>Open</Button>,
          },
          {
            id: "crash-logs",
            icon: Warning,
            title: "Crash logs",
            note: "Recent crashes, with copy and clear.",
            control: <Button onClick={() => navigate({ name: "settings", param: "crash-logs" })}>Open</Button>,
          },
        ],
      },
    ],
  };
}

const ANDROID_HIDDEN_ROWS = new Set([
  "crossfade",
  "automix",
  "gapless",
  "stats-for-nerds",
  "close-to-tray",
  "output-device",
  "reduce-transparency",
  "hide-volume-bar",
  "download-folder",
  "export-downloads",
  "discord-rich-presence",
]);

function forPlatform(categories: SettingsCategory[], platform: Platform): SettingsCategory[] {
  if (platform !== "android") return categories;
  return categories.map((category) => ({
    ...category,
    groups: category.groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => !ANDROID_HIDDEN_ROWS.has(row.id)),
      }))
      .filter((group) => group.rows.length > 0 || group.body !== undefined),
  }));
}

export function buildCategories(context: BuildContext): SettingsCategory[] {
  return forPlatform(
    [
      accountCategory(context),
      playbackCategory(context),
      soundCategory(context),
      lyricsCategory(context),
      displayCategory(context),
      libraryCategory(context),
      scrobblingCategory(context),
      dataCategory(context),
      aboutCategory(context),
    ],
    context.platform,
  );
}

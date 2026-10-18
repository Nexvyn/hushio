import {
  Album02Icon,
  AudioWave01Icon,
  ChartLineData01Icon,
  CloudDownloadIcon,
  DashboardSpeed01Icon,
  DatabaseIcon,
  Delete02Icon,
  Download01Icon,
  DropletIcon,
  FileExportIcon,
  FileImportIcon,
  FilterIcon,
  FolderAddIcon,
  FolderDownloadIcon,
  FolderOpenIcon,
  FullScreenIcon,
  GlobeIcon,
  Infinity01Icon,
  InformationCircleIcon,
  Logout01Icon,
  MaximizeScreenIcon,
  Mic01Icon,
  MusicNote01Icon,
  PaintBoardIcon,
  PlayCircleIcon,
  RefreshIcon,
  RepeatIcon,
  ReplayIcon,
  SidebarBottomIcon,
  SparklesIcon,
  Speaker01Icon,
  Timer01Icon,
  TranslateIcon,
  UserIcon,
  Video01Icon,
  VolumeHighIcon,
  VolumeOffIcon,
  Wifi01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "../../components/Button";
import { RadioGroup, type RadioOption } from "../../components/RadioGroup";
import type { SettingRowProps } from "../../components/SettingRow";
import { Slider } from "../../components/Slider";
import { APP_NAME, APP_SLUG } from "../../lib/app";
import type { View } from "../../stores/navigation";
import type {
  DownloadQuality,
  LoudnessLevel,
  SettingsState,
  SettingsValues,
  StreamingQuality,
} from "../../stores/settings";

export const CATEGORY_IDS = [
  "account",
  "playback",
  "sound",
  "lyrics",
  "display",
  "library",
  "data",
  "about",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type RowSpec = SettingRowProps & { id: string };

export type SettingsGroup = {
  title?: string;
  note?: string;
  rows: RowSpec[];
};

export type SettingsCategory = {
  id: CategoryId;
  label: string;
  lede: string;
  icon: IconSvgElement;
  groups: SettingsGroup[];
};

export type BuildContext = {
  settings: SettingsState;
  version: string | null;
  windows: boolean;
  navigate: (view: View) => void;
};

type BooleanKey = {
  [K in keyof SettingsValues]-?: SettingsValues[K] extends boolean ? K : never;
}[keyof SettingsValues];

const UNLIMITED_SYNC_NOTE =
  "Unofficial. Uses YouTube Music web calls for every change. It can stop working, and it can put your Google account at risk. Off uses the official YouTube API, and switches to the unofficial calls only when the daily quota runs out.";

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

function accountCategory({ settings: s }: BuildContext): SettingsCategory {
  return {
    id: "account",
    label: "Account",
    lede: "Your Google account, sync and the services you've connected",
    icon: UserIcon,
    groups: [
      {
        rows: [
          {
            id: "account-card",
            icon: UserIcon,
            title: "Guest",
            control: (
              <Button variant="primary" disabled>
                Sign in with Google
              </Button>
            ),
          },
          {
            id: "sync-now",
            icon: RefreshIcon,
            title: "Sync now",
            disabled: true,
            control: <Button disabled>Sync now</Button>,
          },
          {
            id: "unlimited-sync",
            icon: Infinity01Icon,
            title: "Unlimited sync (unofficial)",
            note: UNLIMITED_SYNC_NOTE,
            disabled: true,
            toggle: flag(s, "unlimitedSync"),
          },
        ],
      },
      {
        note: "Your library stays on this computer and in your Google account, ready for when you sign in again",
        rows: [
          {
            id: "sign-out",
            icon: Logout01Icon,
            title: "Sign out",
            disabled: true,
            control: <Button disabled>Sign out</Button>,
          },
        ],
      },
      {
        title: "Disconnect & erase",
        rows: [
          {
            id: "disconnect-erase",
            icon: Delete02Icon,
            title: "Disconnect & erase",
            note: `Erases ${APP_NAME}'s data in your Google Drive and on this computer, and disconnects your Google account. Playlists on YouTube stay unless you choose to delete them.`,
            danger: true,
            disabled: true,
            control: (
              <Button disabled>Disconnect & erase</Button>
            ),
          },
        ],
      },
    ],
  };
}

function playbackCategory(context: BuildContext): SettingsCategory {
  const { settings: s, windows } = context;
  const rows: RowSpec[] = [
    {
      id: "crossfade",
      icon: ChartLineData01Icon,
      title: "Crossfade",
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
      icon: SparklesIcon,
      title: "Automix",
      note: s.smartFade
        ? "Blends where the music really ends and lines up beats when tempos match"
        : "Off: blends use the crossfade length above",
      toggle: flag(s, "smartFade"),
    },
    {
      id: "skip-silence",
      icon: VolumeOffIcon,
      title: "Skip silence",
      note: "Skips silence at the start and end of songs.",
      toggle: flag(s, "skipSilence"),
    },
    {
      id: "autoplay",
      icon: Infinity01Icon,
      title: "Autoplay",
      note: "When songs run out, keep playing similar music.",
      toggle: flag(s, "autoplay"),
    },
    {
      id: "no-repeat-suggestions",
      icon: RepeatIcon,
      title: "Don't repeat suggestions",
      note: "Keeps recently played tracks out of the home feed.",
      toggle: flag(s, "dontRepeatSuggestions"),
    },
    {
      id: "playback-speed",
      icon: DashboardSpeed01Icon,
      title: "Playback speed",
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

  if (windows) {
    rows.push({
      id: "close-to-tray",
      icon: SidebarBottomIcon,
      title: "Close to tray (Windows only)",
      note: "Closing the window pauses music. Quit from the tray icon.",
      toggle: flag(s, "closeToTray"),
    });
  }

  return {
    id: "playback",
    label: "Playback",
    lede: "How songs start, end and follow each other",
    icon: PlayCircleIcon,
    groups: [{ rows }],
  };
}

function soundCategory({ settings: s }: BuildContext): SettingsCategory {
  return {
    id: "sound",
    label: "Sound",
    lede: "Quality, loudness, where it plays and how it's shaped",
    icon: AudioWave01Icon,
    groups: [
      {
        rows: [
          {
            id: "streaming-quality",
            icon: Wifi01Icon,
            title: "Streaming quality",
            note: `The highest quality ${APP_NAME} streams`,
            control: (
              <RadioGroup
                label="Streaming quality"
                options={STREAMING_OPTIONS}
                value={s.streamingQuality}
                onChange={(value) => s.setValue("streamingQuality", value)}
              />
            ),
          },
          {
            id: "volume-leveling",
            icon: VolumeHighIcon,
            title: "Volume leveling",
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
        ],
      },
    ],
  };
}

function lyricsCategory({ settings: s }: BuildContext): SettingsCategory {
  const syncedOff = !s.syncedLyrics;
  return {
    id: "lyrics",
    label: "Lyrics",
    lede: "How lyrics follow the song",
    icon: Mic01Icon,
    groups: [
      {
        rows: [
          {
            id: "synced-lyrics",
            icon: Mic01Icon,
            title: "Synced lyrics",
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
            icon: DropletIcon,
            title: "Blur unfocused lyrics",
            note: "Keeps the spotlight on the current line.",
            toggle: flag(s, "blurUnfocusedLyrics"),
            disabled: syncedOff,
          },
          {
            id: "romanized-lyrics",
            icon: TranslateIcon,
            title: "Romanized lyrics",
            note: "Shows a Latin-letter reading under lyrics in other scripts (Hindi, Telugu, Korean).",
            toggle: flag(s, "romanizeLyrics"),
            disabled: syncedOff,
          },
          {
            id: "lyrics-timing",
            icon: Timer01Icon,
            title: "Lyrics timing",
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
        ],
      },
    ],
  };
}

function displayCategory({ settings: s }: BuildContext): SettingsCategory {
  return {
    id: "display",
    label: "Display",
    lede: "Motion, glass and how covers show",
    icon: PaintBoardIcon,
    groups: [
      {
        rows: [
          {
            id: "reduce-animation",
            icon: MaximizeScreenIcon,
            title: "Reduce animation",
            note: "Cuts crossfades and motion through the app.",
            toggle: flag(s, "reduceAnimation"),
          },
          {
            id: "reduce-transparency",
            icon: DropletIcon,
            title: "Reduce transparency",
            note: "Turns off the light blur on menus and popovers.",
            toggle: flag(s, "reduceDynamicBlur"),
          },
          {
            id: "full-bleed-artwork",
            icon: FullScreenIcon,
            title: "Full-screen cover art",
            note: "Lets the artwork bleed behind the status area.",
            toggle: flag(s, "fullBleedArtwork"),
          },
          {
            id: "animated-canvas",
            icon: Video01Icon,
            title: "Animated cover art",
            note: "Plays canvas clips in place of the still cover.",
            toggle: flag(s, "animatedCanvas"),
          },
          {
            id: "hide-volume-bar",
            icon: Speaker01Icon,
            title: "Hide volume bar",
            note: "Keeps the player bar free of the volume slider.",
            toggle: flag(s, "hideVolumeBar"),
          },
        ],
      },
    ],
  };
}

function libraryCategory(context: BuildContext): SettingsCategory {
  const { settings: s, navigate } = context;
  return {
    id: "library",
    label: "Library",
    lede: "Your music folders and downloads",
    icon: Album02Icon,
    groups: [
      {
        rows: [
          {
            id: "local-folders",
            icon: FolderOpenIcon,
            title: "Local music folders",
            note: s.localMusicFolder ? "Your imported collections" : "No folders imported yet",
            control: (
              <Button onClick={() => navigate({ name: "local" })}>Open</Button>
            ),
          },
          {
            id: "add-folder",
            icon: FolderAddIcon,
            title: "Add a folder",
            note: "Import music folders. A parent folder brings its music subfolders along",
            disabled: true,
            control: <Button disabled>Add folder</Button>,
          },
          {
            id: "rescan-library",
            icon: RefreshIcon,
            title: "Rescan library",
            note: "Re-read tags and artwork from every imported folder",
            disabled: true,
            control: <Button disabled>Rescan</Button>,
          },
          {
            id: "filter-non-music",
            icon: FilterIcon,
            title: "Filter non-music audio",
            note: "Hides clips, recordings and voice notes. Applies on rescan.",
            toggle: flag(s, "filterNonMusicAudio"),
          },
        ],
      },
      {
        rows: [
          {
            id: "download-folder",
            icon: FolderDownloadIcon,
            title: "Download folder",
            note: s.downloadDir ?? `Default: your system Downloads folder / ${APP_NAME}`,
            disabled: true,
            control: <Button disabled>Choose</Button>,
          },
          {
            id: "download-quality",
            icon: Download01Icon,
            title: "Download quality",
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
          {
            id: "export-downloads",
            icon: FileExportIcon,
            title: "Export compatible downloads",
            note: `Also save them into your Music library (Music/${APP_NAME}), so other players can use the files. Otherwise downloads stay in the folder above`,
            value: s.exportDownloads ? `Music/${APP_NAME}` : undefined,
            toggle: flag(s, "exportDownloads"),
          },
        ],
      },
    ],
  };
}

function dataCategory({ navigate }: BuildContext): SettingsCategory {
  return {
    id: "data",
    label: "Your data",
    lede: "Your listening, your backups and a fresh start",
    icon: DatabaseIcon,
    groups: [
      {
        rows: [
          {
            id: "replay",
            icon: ReplayIcon,
            title: "Replay",
            note: "Your listening wrapped over time",
            control: <Button onClick={() => navigate({ name: "replay" })}>Open</Button>,
          },
          {
            id: "export-data",
            icon: FileExportIcon,
            title: "Export data",
            note: "Write a backup of your library and history",
            disabled: true,
            control: <Button disabled>Export</Button>,
          },
          {
            id: "import-data",
            icon: FileImportIcon,
            title: "Import data",
            note: "Restore a backup, replacing what's here",
            disabled: true,
            control: <Button disabled>Import</Button>,
          },
          {
            id: "reset-app-data",
            icon: Delete02Icon,
            title: "Reset app data",
            note: "Erase library, playlists, history and settings on this device",
            danger: true,
            disabled: true,
            control: <Button disabled>Reset</Button>,
          },
        ],
      },
    ],
  };
}

function aboutCategory({ version }: BuildContext): SettingsCategory {
  return {
    id: "about",
    label: "About",
    lede: `The version you're running and where ${APP_NAME} lives`,
    icon: InformationCircleIcon,
    groups: [
      {
        rows: [
          {
            id: "brand",
            icon: MusicNote01Icon,
            title: APP_NAME,
            note: "Free and open source under GPL-3.0",
            value: version ? `Version ${version}` : undefined,
          },
          {
            id: "updates",
            icon: CloudDownloadIcon,
            title: "Updates",
            note: version ? `You have version ${version}` : undefined,
            disabled: true,
            control: <Button disabled>Check for updates</Button>,
          },
          {
            id: "website",
            icon: GlobeIcon,
            title: `${APP_NAME} website`,
            note: `${APP_SLUG}.space: downloads, news and help`,
            control: <Button disabled>Open</Button>,
          },
        ],
      },
    ],
  };
}

export function buildCategories(context: BuildContext): SettingsCategory[] {
  return [
    accountCategory(context),
    playbackCategory(context),
    soundCategory(context),
    lyricsCategory(context),
    displayCategory(context),
    libraryCategory(context),
    dataCategory(context),
    aboutCategory(context),
  ];
}

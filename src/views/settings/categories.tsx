import {
  Album02Icon,
  Alert01Icon,
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
  ImportIcon,
  FilterIcon,
  FolderAddIcon,
  FolderDownloadIcon,
  FolderOpenIcon,
  FullScreenIcon,
  GlobeIcon,
  Infinity01Icon,
  InformationCircleIcon,
  Link01Icon,
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
  SlidersHorizontalIcon,
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
import type { ReactNode } from "react";
import { Button } from "../../components/Button";
import { Equalizer } from "../../components/Equalizer";
import { GoogleAccountCard } from "../../components/GoogleAccountCard";
import { OutputDevicePicker } from "../../components/OutputDevicePicker";
import { RadioGroup, type RadioOption } from "../../components/RadioGroup";
import type { SettingRowProps } from "../../components/SettingRow";
import { YouTubeMusicPrompt } from "../../components/YouTubeMusicPrompt";
import { Slider } from "../../components/Slider";
import { APP_NAME, APP_SLUG } from "../../lib/app";
import type { DriveSyncStatus, GoogleAccount, Platform, YtSyncStatus, YtTvCode } from "../../lib/bridge";
import { driveStatusText } from "../../lib/driveSync";
import { MATCH_LANGUAGE_OPTIONS } from "../../lib/importLanguage";
import { failedText, quotaText, syncStatusText } from "../../lib/ytSync";
import { chooseDownloadFolder } from "../../lib/downloads";
import { confirmImportBackup, exportBackup } from "../../lib/importBackup";
import { useLocalLibrary } from "../../stores/localLibrary";
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
  body?: ReactNode;
};

export type SettingsCategory = {
  id: CategoryId;
  label: string;
  lede: string;
  icon: IconSvgElement;
  groups: SettingsGroup[];
};

export type AuthContext = {
  account: GoogleAccount;
  signingIn: boolean;
  signIn: () => void;
  cancelSignIn: () => void;
  requestSignOut: () => void;
};

export type TvContext = {
  connected: boolean;
  code: YtTvCode | null;
  busy: boolean;
  error: string | null;
  connect: () => void;
  cancel: () => void;
  open: () => void;
  disconnect: () => void;
};

export type SyncContext = {
  status: YtSyncStatus;
  drive: DriveSyncStatus;
  syncNow: () => void;
  tv: TvContext;
};

export type BuildContext = {
  settings: SettingsState;
  version: string | null;
  platform: Platform;
  navigate: (view: View) => void;
  auth: AuthContext;
  sync: SyncContext;
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

function tvRows(visible: boolean, tv: TvContext): RowSpec[] {
  if (!visible) return [];
  if (tv.connected) {
    return [
      {
        id: "tv-disconnect",
        icon: Logout01Icon,
        title: "Disconnect YouTube Music",
        control: <Button onClick={tv.disconnect}>Disconnect</Button>,
      },
    ];
  }
  return [
    {
      id: "tv-connect",
      icon: Link01Icon,
      title: "Connect YouTube Music",
      control: (
        <Button disabled={tv.busy} onClick={tv.connect}>
          Connect
        </Button>
      ),
    },
  ];
}

function accountCategory({ settings: s, navigate, auth, sync }: BuildContext): SettingsCategory {
  const signedIn = auth.account.mode === "google";
  const running = sync.status.state === "running";
  const syncNote = [
    syncStatusText(sync.status, Date.now()),
    sync.status.failedJobs > 0 ? failedText(sync.status.failedJobs) : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    id: "account",
    label: "Account",
    lede: "Your Google account, sync and the services you've connected",
    icon: UserIcon,
    groups: [
      {
        rows: [],
        body: (
          <GoogleAccountCard
            account={auth.account}
            signingIn={auth.signingIn}
            onSignIn={auth.signIn}
            onCancelSignIn={auth.cancelSignIn}
          />
        ),
      },
      {
        title: "Sync",
        note: signedIn ? syncNote : undefined,
        rows: [
          {
            id: "sync-now",
            icon: RefreshIcon,
            title: "Sync now",
            note: signedIn ? quotaText(sync.status) : undefined,
            disabled: !signedIn || running,
            control: (
              <Button disabled={!signedIn || running} onClick={sync.syncNow}>
                Sync now
              </Button>
            ),
          },
          {
            id: "drive-sync-status",
            icon: DatabaseIcon,
            title: "Google Drive",
            note: driveStatusText(sync.drive, signedIn),
            disabled: !signedIn,
          },
          {
            id: "unlimited-sync",
            icon: Infinity01Icon,
            title: "Unlimited sync (unofficial)",
            note: UNLIMITED_SYNC_NOTE,
            disabled: !signedIn,
            toggle: flag(s, "unlimitedSync"),
          },
          ...tvRows(s.unlimitedSync && signedIn, sync.tv),
        ],
      },
      ...(s.unlimitedSync && signedIn && (sync.tv.code || sync.tv.error || sync.tv.busy)
        ? [
            {
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
            },
          ]
        : []),
      {
        note: "Sync stops. Your data stays on this computer and in your Google account.",
        rows: [
          {
            id: "sign-out",
            icon: Logout01Icon,
            title: "Sign out",
            disabled: !signedIn,
            control: (
              <Button disabled={!signedIn} onClick={auth.requestSignOut}>
                Sign out
              </Button>
            ),
          },
        ],
      },
      {
        title: "Connected services",
        rows: [
          {
            id: "import-playlists",
            icon: ImportIcon,
            title: "Import",
            note: "Paste a playlist link or a list of songs, or open a CSV, M3U8 or JSON file",
            control: <Button onClick={() => navigate({ name: "import" })}>Open</Button>,
          },
          {
            id: "song-versions",
            icon: TranslateIcon,
            title: "Song versions",
            note: "When a song has versions in several languages, imports and playlists pick this one.",
            control: (
              <RadioGroup
                label="Song versions"
                options={MATCH_LANGUAGE_OPTIONS}
                value={s.matchLanguage}
                onChange={(value) => s.setValue("matchLanguage", value)}
              />
            ),
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
  const { settings: s, platform } = context;
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

  if (platform === "windows") {
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

function soundCategory({ settings: s, platform }: BuildContext): SettingsCategory {
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
          platform === "windows"
            ? {
                id: "output-device",
                icon: Speaker01Icon,
                title: "Output device",
                note: s.audioSinkId ? "Pinned to this device" : "Following the system default",
                control: <OutputDevicePicker />,
              }
            : {
                id: "output-device",
                icon: Speaker01Icon,
                title: "Output device",
                note: "Follows the system output",
                disabled: true,
              },
        ],
      },
      {
        rows: [
          {
            id: "equalizer",
            icon: SlidersHorizontalIcon,
            title: "Equalizer",
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
            icon: Alert01Icon,
            title: "Prevent clipping",
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
            control: <Button onClick={() => void useLocalLibrary.getState().importFromPicker()}>Add folder</Button>,
          },
          {
            id: "rescan-library",
            icon: RefreshIcon,
            title: "Rescan library",
            note: "Re-read tags and artwork from every imported folder",
            control: <Button onClick={() => void useLocalLibrary.getState().scan()}>Rescan</Button>,
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
            control: <Button onClick={() => void chooseDownloadFolder()}>Choose</Button>,
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
            control: <Button onClick={() => exportBackup()}>Export</Button>,
          },
          {
            id: "import-data",
            icon: FileImportIcon,
            title: "Import data",
            note: "Restore a backup, replacing what's here",
            control: <Button onClick={confirmImportBackup}>Import</Button>,
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

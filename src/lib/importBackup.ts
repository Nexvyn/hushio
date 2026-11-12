import { APP_NAME, APP_SLUG } from "./app";
import { replayExport, replayImport } from "./bridge";
import { downloadText } from "./downloadText";
import { isMatchLanguage } from "./importLanguage";
import type { Track } from "../types";
import { DEFAULT_PINS, LIBRARY_VERSION, useLibrary, type LibraryValues } from "../stores/library";
import { usePlayer, type PlayerState } from "../stores/player";
import { useRecents } from "../stores/recents";
import {
  CROSSFADE_LIMIT,
  DEVICE_SETTINGS_KEYS,
  DOWNLOAD_QUALITIES,
  LOUDNESS_LEVELS,
  PLAYBACK_SPEED_RANGE,
  STREAMING_QUALITIES,
  useSettings,
  type SettingsState,
  type SettingsValues,
} from "../stores/settings";
import { useUI } from "../stores/ui";

const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const RECENT_LIMIT = 50;
const RELOAD_DELAY_MS = 900;
const NOT_BACKUP = `That doesn't look like a ${APP_NAME} backup`;
const NEWER = `That backup was written by a newer version of ${APP_NAME}`;
const OTHER_APP = "That backup is from another app";
const TOO_LARGE = "That backup file is too large to import";

const LIBRARY_KEYS = ["liked", "history", "followedArtists", "pinnedSingles", "playlists", "folders", "libraryOrder"] as const;
const PLAYER_KEYS = ["queue", "index", "volume", "muted", "shuffle", "repeat", "unshuffled", "playingFrom", "autoplayCount"] as const;
const LISTENING_VERSION = 1;
const LIBRARY_LIST_KEYS = ["liked", "history", "followedArtists", "playlists", "folders"] as const;

type Envelope = { state: Record<string, unknown>; version: number };

export type BackupDoc = {
  app: string;
  version: number;
  exportedAt: string;
  settings?: Record<string, unknown>;
  library?: Envelope;
  player?: Envelope;
  listening?: Envelope;
  recentSearches?: string[];
};

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function pick<T extends object, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) result[key] = source[key];
  return result;
}

function isDeviceKey(key: string): boolean {
  return (DEVICE_SETTINGS_KEYS as readonly string[]).includes(key);
}

function settingValues(state: SettingsState): Json {
  const values: Json = {};
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== "function" && !isDeviceKey(key)) values[key] = value;
  }
  return values;
}

export function backupFileName(now: Date): string {
  return `${APP_SLUG}-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function buildBackup(now: Date = new Date(), listening: unknown[] = []): BackupDoc {
  const library = useLibrary.getState();
  const player = usePlayer.getState();
  return {
    app: APP_SLUG,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings: settingValues(useSettings.getState()),
    library: { state: pick(library, LIBRARY_KEYS), version: LIBRARY_VERSION },
    player: { state: pick(player, PLAYER_KEYS), version: 0 },
    listening: { state: { buckets: listening }, version: LISTENING_VERSION },
    recentSearches: useRecents
      .getState()
      .searches.map((search) => search.trim())
      .filter(Boolean)
      .slice(0, RECENT_LIMIT),
  };
}

export function serializeBackup(doc: BackupDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function envelopeOf(value: unknown, name: string): Envelope | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.state) || typeof value.version !== "number" || !Number.isFinite(value.version)) {
    throw new Error(`${NOT_BACKUP} (malformed ${name} section)`);
  }
  return { state: value.state, version: value.version };
}

export function parseBackup(text: string): BackupDoc {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error(NOT_BACKUP);
  }
  if (!isRecord(doc)) throw new Error(NOT_BACKUP);
  if (doc.app !== APP_SLUG) throw new Error(OTHER_APP);
  const version = doc.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new Error(NOT_BACKUP);
  if (version > BACKUP_VERSION) throw new Error(NEWER);

  return {
    app: APP_SLUG,
    version,
    exportedAt: typeof doc.exportedAt === "string" ? doc.exportedAt : "",
    settings: isRecord(doc.settings) ? doc.settings : undefined,
    library: envelopeOf(doc.library, "library"),
    player: envelopeOf(doc.player, "player"),
    listening: envelopeOf(doc.listening, "listening"),
    recentSearches: Array.isArray(doc.recentSearches)
      ? doc.recentSearches.filter((item): item is string => typeof item === "string")
      : undefined,
  };
}

function validSetting(key: string, value: unknown, current: unknown): boolean {
  switch (key) {
    case "theme":
      return value === "dark" || value === "light" || value === "system";
    case "streamingQuality":
      return (STREAMING_QUALITIES as readonly unknown[]).includes(value);
    case "loudnessLevel":
      return (LOUDNESS_LEVELS as readonly unknown[]).includes(value);
    case "downloadQuality":
      return (DOWNLOAD_QUALITIES as readonly unknown[]).includes(value);
    case "matchLanguage":
      return isMatchLanguage(value);
    case "crossfadeSeconds":
      return typeof value === "number" && value >= 0 && value <= CROSSFADE_LIMIT;
    case "playbackSpeed":
      return typeof value === "number" && value >= PLAYBACK_SPEED_RANGE[0] && value <= PLAYBACK_SPEED_RANGE[1];
    default:
      return typeof value === typeof current;
  }
}

function settingsPatch(input: Json, current: SettingsState): Partial<SettingsValues> {
  const values: Json = current;
  const patch: Json = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in values) || typeof values[key] === "function" || isDeviceKey(key)) continue;
    if (validSetting(key, value, values[key])) patch[key] = value;
  }
  return patch as Partial<SettingsValues>;
}

function libraryPatch(state: Json): Partial<LibraryValues> {
  const patch: Json = {};
  for (const key of LIBRARY_LIST_KEYS) {
    const value = state[key];
    if (Array.isArray(value) && value.every(isRecord)) patch[key] = value;
  }
  if (isRecord(state.pinnedSingles)) patch.pinnedSingles = { ...DEFAULT_PINS, ...state.pinnedSingles };
  if (Array.isArray(state.libraryOrder)) patch.libraryOrder = state.libraryOrder.filter((key) => typeof key === "string");
  return patch as Partial<LibraryValues>;
}

function isTrack(value: unknown): value is Track {
  return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" && typeof value.artist === "string";
}

function playerPatch(state: Json): Partial<PlayerState> {
  const patch: Json = {};
  if (Array.isArray(state.queue) && state.queue.every(isTrack)) {
    patch.queue = state.queue;
    const index = typeof state.index === "number" ? Math.floor(state.index) : 0;
    patch.index = Math.min(Math.max(index, 0), Math.max(state.queue.length - 1, 0));
  }
  if (typeof state.volume === "number" && state.volume >= 0 && state.volume <= 1) patch.volume = state.volume;
  if (typeof state.muted === "boolean") patch.muted = state.muted;
  if (typeof state.shuffle === "boolean") patch.shuffle = state.shuffle;
  if (typeof state.repeat === "string") patch.repeat = state.repeat;
  return patch as Partial<PlayerState>;
}

export function restoreBackup(doc: BackupDoc): void {
  if (doc.settings) useSettings.setState(settingsPatch(doc.settings, useSettings.getState()));
  if (doc.library) useLibrary.setState(libraryPatch(doc.library.state));
  if (doc.player) usePlayer.setState(playerPatch(doc.player.state));
  if (doc.listening && Array.isArray(doc.listening.state.buckets)) {
    replayImport(doc.listening.state.buckets).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't restore listening history."), "error");
    });
  }
  if (doc.recentSearches) useRecents.setState({ searches: doc.recentSearches.slice(0, RECENT_LIMIT) });
}

export async function exportBackup(now: Date = new Date()): Promise<void> {
  const toast = useUI.getState().toast;
  try {
    const listening = await replayExport();
    downloadText(backupFileName(now), serializeBackup(buildBackup(now, listening)), "application/json");
    toast("Backup saved", "success");
  } catch (error) {
    toast(messageOf(error, "Couldn't save the backup."), "error");
  }
}

function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export async function importBackupFromPicker(): Promise<void> {
  const toast = useUI.getState().toast;
  try {
    const file = await pickBackupFile();
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) throw new Error(TOO_LARGE);
    restoreBackup(parseBackup(await file.text()));
    toast("Backup restored. Reloading…", "success");
    window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
  } catch (error) {
    toast(messageOf(error, "Couldn't import the backup."), "error");
  }
}

export function confirmImportBackup(): void {
  useUI.getState().openDialog({
    title: "Import a backup?",
    body: "Your current library, playlists and history will be replaced by the backup's.",
    confirmLabel: "Choose file",
    danger: true,
    onConfirm: () => {
      void importBackupFromPicker();
    },
  });
}

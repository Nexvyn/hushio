import { getVersion } from "@tauri-apps/api/app";
import { convertFileSrc, invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type Platform = "windows" | "macos" | "linux" | "android";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return "android";
  if (/Linux/.test(ua)) return "linux";
  if (/Macintosh|Mac OS X/.test(ua)) return "macos";
  if (/Windows/.test(ua)) return "windows";
  throw new Error(`Unsupported platform: ${ua}`);
}

export const platform: Platform = detectPlatform();

export async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (String(error).includes("not found")) {
      throw new Error(`Native command "${command}" is not available`);
    }
    throw error;
  }
}

export function showMainWindow(): Promise<void> {
  return getCurrentWindow().show();
}

export function appVersion(): Promise<string> {
  return getVersion();
}

export function setFullScreen(enabled: boolean): Promise<void> {
  return getCurrentWindow().setFullscreen(enabled);
}

export function minimizeWindow(): Promise<void> {
  return getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): Promise<void> {
  return getCurrentWindow().toggleMaximize();
}

export function closeWindow(): Promise<void> {
  return getCurrentWindow().close();
}

export async function watchWindowMaximized(onChange: (value: boolean) => void): Promise<() => void> {
  const current = getCurrentWindow();
  const update = () => {
    void current.isMaximized().then(onChange);
  };
  const unlisten = await current.onResized(update);
  update();
  return unlisten;
}

export async function watchFullScreen(onChange: (value: boolean) => void): Promise<() => void> {
  const current = getCurrentWindow();
  const update = () => {
    void current.isFullscreen().then(onChange);
  };
  const unlisten = await current.onResized(update);
  update();
  return unlisten;
}

export function persistRead<T>(name: string, owner: string): Promise<T | null> {
  return call<T | null>("persist_read", { name, owner });
}

export function persistWrite(name: string, data: unknown, owner: string): Promise<boolean> {
  return call<boolean>("persist_write", { name, data, owner });
}

export function streamProxyPort(): Promise<number> {
  return call<number>("stream_proxy_port");
}

export function registerStreamUrl(id: string, url: string): Promise<void> {
  return call<void>("stream_register", { id, url });
}

export async function naturalScrollDirection(): Promise<boolean | null> {
  try {
    return await call<boolean | null>("os_scroll_direction");
  } catch {
    return null;
  }
}

export interface LyricsMeta {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

export interface SyncedLyricWord {
  start: number;
  end: number;
  text: string;
}

export interface SyncedLyricBg {
  text: string;
  words?: SyncedLyricWord[];
}

export interface SyncedLyricLine {
  time: number;
  text: string;
  end?: number;
  words?: SyncedLyricWord[];
  bg?: SyncedLyricBg;
  roman?: string;
  gap?: boolean;
}

export interface LyricsResult {
  synced: SyncedLyricLine[] | null;
  plain: string | null;
  source: string;
  wordSynced: boolean;
}

export function lyricsGet(meta: LyricsMeta): Promise<LyricsResult | null> {
  return call<LyricsResult | null>("lyrics_get", { meta });
}

export interface DownloadTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  thumb?: string;
}

export type DownloadEventKind = "queued" | "start" | "progress" | "done" | "failed" | "cancelled";

export interface DownloadEvent {
  type: DownloadEventKind;
  id: string;
  downloaded?: number;
  total?: number;
  path?: string;
  reason?: string;
}

export interface DownloadQueueRow {
  id: string;
  running: boolean;
  downloaded: number;
  total: number;
}

export function downloadStart(
  track: DownloadTrack,
  url: string,
  dir?: string,
  exportCompat = false,
): Promise<void> {
  return call<void>("download_start", { track, url, dir, exportCompat });
}

export function pickFolder(title?: string): Promise<string | null> {
  return call<string | null>("folder_pick", { title });
}

export function pathExists(path: string): Promise<boolean> {
  return call<boolean>("path_exists", { path });
}

export function revealPath(path: string): Promise<void> {
  return call<void>("reveal_path", { path });
}

export function openFolder(path?: string): Promise<void> {
  return call<void>("open_folder", { path });
}

export function fileSrc(path: string): string {
  return convertFileSrc(path);
}

export function downloadCancel(id: string): Promise<boolean> {
  return call<boolean>("download_cancel", { id });
}

export function downloadQueue(): Promise<DownloadQueueRow[]> {
  return call<DownloadQueueRow[]>("download_queue");
}

export function listenDownloadEvents(onEvent: (event: DownloadEvent) => void): Promise<UnlistenFn> {
  return listen<DownloadEvent>("download:event", (event) => onEvent(event.payload));
}

export interface LocalFolderEntry {
  path: string;
  name: string;
  displayName?: string;
  addedAt: number;
}

export interface LocalTrack {
  id: string;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre?: string;
  duration: number;
  size: number;
  mtime: number;
  art?: string;
  codec?: string;
}

export interface LocalUnplayable {
  format: string;
  count: number;
}

export interface LocalLibrary {
  folders: LocalFolderEntry[];
  scannedAt: number;
  tracks: LocalTrack[];
  unplayable: LocalUnplayable[];
}

export interface LocalAddResult {
  lib: LocalLibrary;
  added: LocalFolderEntry[];
  skipped: string[];
}

export interface LocalFolderStatus {
  path: string;
  exists: boolean;
}

export interface LocalOpenResult {
  tracks: LocalTrack[];
  folders: string[];
  unplayable: string[];
}

export type FileDropEvent =
  | { type: "enter" | "drop"; paths: string[] }
  | { type: "over" | "leave" };

export function localLibraryGet(): Promise<LocalLibrary> {
  return call<LocalLibrary>("local_library_get");
}

export function localLibraryAddFolders(paths: string[]): Promise<LocalAddResult> {
  return call<LocalAddResult>("local_library_add_folders", { paths });
}

export function localLibraryScan(filterNonMusic: boolean): Promise<LocalLibrary> {
  return call<LocalLibrary>("local_library_scan", { filterNonMusic });
}

export function localLibraryRemoveFolder(path: string): Promise<LocalLibrary> {
  return call<LocalLibrary>("local_library_remove_folder", { path });
}

export function localLibraryRenameFolder(path: string, displayName: string): Promise<LocalLibrary> {
  return call<LocalLibrary>("local_library_rename_folder", { path, displayName });
}

export function localLibraryFolderStatuses(): Promise<LocalFolderStatus[]> {
  return call<LocalFolderStatus[]>("local_library_folder_statuses");
}

export function localLibraryOpened(): Promise<LocalTrack[]> {
  return call<LocalTrack[]>("local_library_opened");
}

export function localLibraryForgetOpened(id: string): Promise<LocalTrack[]> {
  return call<LocalTrack[]>("local_library_forget_opened", { id });
}

export function localLibraryOpenFiles(paths: string[]): Promise<LocalOpenResult> {
  return call<LocalOpenResult>("local_library_open_files", { paths });
}

export function localLibraryTrackPath(id: string): Promise<string | null> {
  return call<string | null>("local_library_track_path", { id });
}

export async function listenFileDrop(onEvent: (event: FileDropEvent) => void): Promise<UnlistenFn> {
  return getCurrentWindow().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "enter" || payload.type === "drop") {
      onEvent({ type: payload.type, paths: payload.paths });
    } else {
      onEvent({ type: payload.type });
    }
  });
}

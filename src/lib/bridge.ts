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

export function pickFolder(): Promise<string | null> {
  return call<string | null>("folder_pick");
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

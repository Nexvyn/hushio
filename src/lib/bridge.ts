import { getVersion } from "@tauri-apps/api/app";
import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
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

export async function naturalScrollDirection(): Promise<boolean | null> {
  try {
    return await call<boolean | null>("os_scroll_direction");
  } catch {
    return null;
  }
}

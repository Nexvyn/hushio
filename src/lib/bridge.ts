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

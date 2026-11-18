import { platform, playerSetSystemBars } from "./bridge";

export type ThemeMode = "dark" | "light" | "system";
export type DesktopScheme = "dark" | "light" | "none";

const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
let removeSystemListener: (() => void) | undefined;

function syncSystemBars(dark: boolean) {
  if (platform === "android") void playerSetSystemBars(dark).catch(() => {});
}

export function applyTheme(mode: ThemeMode, desktop: DesktopScheme = "none") {
  removeSystemListener?.();
  removeSystemListener = undefined;

  const root = document.documentElement;
  if (mode !== "system") {
    root.dataset.theme = mode;
    syncSystemBars(mode === "dark");
    return;
  }

  if (desktop !== "none") {
    root.dataset.theme = desktop;
    syncSystemBars(desktop === "dark");
    return;
  }

  root.dataset.theme = "system";
  syncSystemBars(systemPreference.matches);
  const onChange = () => {
    root.dataset.theme = systemPreference.matches ? "dark" : "light";
    syncSystemBars(systemPreference.matches);
  };
  systemPreference.addEventListener("change", onChange);
  removeSystemListener = () => systemPreference.removeEventListener("change", onChange);
}

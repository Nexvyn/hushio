export type ThemeMode = "dark" | "light" | "system";
export type DesktopScheme = "dark" | "light" | "none";

const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
let removeSystemListener: (() => void) | undefined;

export function applyTheme(mode: ThemeMode, desktop: DesktopScheme = "none") {
  removeSystemListener?.();
  removeSystemListener = undefined;

  const root = document.documentElement;
  if (mode !== "system") {
    root.dataset.theme = mode;
    return;
  }

  if (desktop !== "none") {
    root.dataset.theme = desktop;
    return;
  }

  root.dataset.theme = "system";
  const onChange = () => {
    root.dataset.theme = systemPreference.matches ? "dark" : "light";
  };
  systemPreference.addEventListener("change", onChange);
  removeSystemListener = () => systemPreference.removeEventListener("change", onChange);
}

export type ThemeMode = "dark" | "light" | "system";

const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
let removeSystemListener: (() => void) | undefined;

export function applyTheme(mode: ThemeMode) {
  removeSystemListener?.();
  removeSystemListener = undefined;

  const root = document.documentElement;
  if (mode !== "system") {
    root.dataset.theme = mode;
    return;
  }

  root.dataset.theme = "system";
  const onChange = () => {
    root.dataset.theme = systemPreference.matches ? "dark" : "light";
  };
  systemPreference.addEventListener("change", onChange);
  removeSystemListener = () => systemPreference.removeEventListener("change", onChange);
}

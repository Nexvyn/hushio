import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";
import type { ThemeMode } from "../lib/theme";
import { useSettings } from "../stores/settings";

export type ThemeChoice = { mode: ThemeMode; label: string; icon: IconSvgElement };

export const THEME_CHOICES: ThemeChoice[] = [
  { mode: "light", label: "Light", icon: Sun01Icon },
  { mode: "dark", label: "Dark", icon: Moon02Icon },
  { mode: "system", label: "System", icon: ComputerIcon },
];

export function themeChoice(mode: ThemeMode): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice.mode === mode) ?? THEME_CHOICES[2];
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  const index = THEME_CHOICES.findIndex((choice) => choice.mode === mode);
  return THEME_CHOICES[(index + 1) % THEME_CHOICES.length].mode;
}

export function ThemeButton({ className }: { className: string }) {
  const mode = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const label = `Switch to ${themeChoice(nextThemeMode(mode)).label.toLowerCase()} theme`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(nextThemeMode(mode))}
      className={className}
    >
      <Icon icon={themeChoice(mode).icon} />
    </button>
  );
}

import { Monitor, MoonStars, Sun, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import type { ThemeMode } from "../lib/theme";
import { useSettings } from "../stores/settings";

export type ThemeChoice = { mode: ThemeMode; label: string; icon: PhosphorIcon };

const THEME_CHOICES: ThemeChoice[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: MoonStars },
  { mode: "system", label: "System", icon: Monitor },
];

function themeChoice(mode: ThemeMode): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice.mode === mode) ?? THEME_CHOICES[2];
}

function nextThemeMode(mode: ThemeMode): ThemeMode {
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

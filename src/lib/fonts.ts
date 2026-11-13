import { platform } from "./bridge";

const HUSHIO_STACK = '"Inter Variable", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';

export const TITLE_STACK = '"Instrument Sans Variable", "Inter Variable", system-ui, sans-serif';

export const APP_FONTS = [
  {
    id: "system",
    label: "System",
    stack: '"Segoe UI Variable Display", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "hushio",
    label: "Hushio",
    stack: HUSHIO_STACK,
  },
  {
    id: "classic",
    label: "Classic",
    stack: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "round",
    label: "Round",
    stack: '"SF Pro Rounded", "Hiragino Maru Gothic ProN", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "mono",
    label: "Monospace",
    stack: '"Cascadia Mono", "Consolas", "SF Mono", "DejaVu Sans Mono", monospace',
  },
] as const;

export type AppFontId = (typeof APP_FONTS)[number]["id"];

export const DEFAULT_FONT: AppFontId = "system";

export function fontStack(id: string): string {
  const font = APP_FONTS.find((option) => option.id === id) ?? APP_FONTS[0];
  if (font.id === "system" && platform === "android") return HUSHIO_STACK;
  return font.stack;
}

export function isAppFont(id: unknown): id is AppFontId {
  return APP_FONTS.some((font) => font.id === id);
}

export function applyFontVars(root: HTMLElement, id: string): void {
  const stack = fontStack(id);
  root.style.setProperty("--font-app", stack);
  root.style.setProperty("--font-lyric", stack);
  root.style.setProperty("--font-title", platform === "android" || id === "hushio" ? TITLE_STACK : stack);
}

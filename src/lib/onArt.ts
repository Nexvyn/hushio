import { createContext, useContext } from "react";

export const OnArtContext = createContext(false);

const SURFACE = {
  primary: "text-ink-1",
  secondary: "text-ink-2",
  faint: "text-ink-3",
  tint: "bg-wash",
  hover: "hover:bg-hover",
  hoverText: "hover:text-ink-1",
} as const;

const ART = {
  primary: "text-art",
  secondary: "text-art/[0.55]",
  faint: "text-art/[0.55]",
  tint: "bg-art/[0.18]",
  hover: "hover:bg-art/[0.18]",
  hoverText: "hover:text-art",
} as const;

type Ink = { [K in keyof typeof SURFACE]: string };

export function useInk(): Ink {
  return useContext(OnArtContext) ? ART : SURFACE;
}

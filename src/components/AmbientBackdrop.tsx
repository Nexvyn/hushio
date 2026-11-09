import { useEffect, useState } from "react";
import { upgradeArtwork } from "../lib/artwork";
import { applyAmbientVars, parseRgb, useArtworkPalette, type Rgb } from "../lib/artworkPalette";
import { DURATION_MS, reducedMotion } from "../lib/motion";
import { peekArtistMeta } from "../stores/artistMeta";
import { currentTrack, usePlayer } from "../stores/player";

export const PALETTE_ART = 544;

type TrackCover = { thumb?: string | null; artist?: string } | null;

export function paletteCoverFor(track: TrackCover): string {
  if (!track) return "";
  return upgradeArtwork(track.thumb, PALETTE_ART) || upgradeArtwork(peekArtistMeta(track.artist ?? "")?.thumb, PALETTE_ART);
}

type AmbientVariant = "full" | "banner";

const VARIANT_CLASS: Record<AmbientVariant, string> = {
  full: "absolute inset-0",
  banner: "absolute inset-x-0 top-0 h-[460px]",
};

const BANNER_MASK = "linear-gradient(to bottom, black 55%, transparent)";
const DARK_NEUTRAL: Rgb = [28, 28, 28];
const LIGHT_NEUTRAL: Rgb = [236, 236, 236];
const DARK_INK: Rgb = [255, 255, 255];
const LIGHT_INK: Rgb = [17, 17, 17];
const AA_CONTRAST = 4.5;
const LIGHTNESS_STEP = 0.02;

function channelLinear(value: number): number {
  const x = value / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl([r, g, b]: Rgb): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l };
  const span = 1 - Math.abs(2 * l - 1);
  const s = span === 0 ? 0 : delta / span;
  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] =
    sector === 0 ? [chroma, x, 0]
    : sector === 1 ? [x, chroma, 0]
    : sector === 2 ? [0, chroma, x]
    : sector === 3 ? [0, x, chroma]
    : sector === 4 ? [x, 0, chroma]
    : [chroma, 0, x];
  return [r, g, b].map((channel) => Math.round((channel + m) * 255)) as Rgb;
}

function isLightTheme(): boolean {
  if (typeof document === "undefined") return false;
  const text = getComputedStyle(document.documentElement).getPropertyValue("--on-art").trim();
  return text !== "" && parseRgb(text)[0] < 128;
}

export function flatFillFor(source: string, light: boolean): string {
  const rgb = parseRgb(source);
  const valid = source.trim().split(/\s+/).length === 3 && rgb.every((channel) => Number.isFinite(channel));
  if (!valid) return formatFill(light ? LIGHT_NEUTRAL : DARK_NEUTRAL);
  const { h, s } = rgbToHsl(rgb);
  const ink = light ? LIGHT_INK : DARK_INK;
  let lightness = light ? 0.9 : 0.2;
  const saturation = Math.min(s, light ? 0.35 : 0.55);
  let fill = hslToRgb(h, saturation, lightness);
  while (contrast(fill, ink) < AA_CONTRAST && (light ? lightness < 1 : lightness > 0)) {
    lightness += light ? LIGHTNESS_STEP : -LIGHTNESS_STEP;
    fill = hslToRgb(h, saturation, lightness);
  }
  return formatFill(fill);
}

function formatFill([r, g, b]: Rgb): string {
  return `rgb(${r} ${g} ${b})`;
}

type Layer = { fill: string };

function FlatLayer({ fill, animate }: { fill: string; animate: boolean }) {
  return <div className={`absolute inset-0 ${animate ? "bt-ambient-in" : ""}`} style={{ backgroundColor: fill }} />;
}

type AmbientBackdropProps = {
  primary: string;
  src?: string;
  variant?: AmbientVariant;
  className?: string;
};

export function AmbientBackdrop({ primary, src = "", variant = "full", className = "" }: AmbientBackdropProps) {
  const reduced = reducedMotion();
  const light = isLightTheme();
  const fill = src ? flatFillFor(primary, light) : formatFill(light ? LIGHT_NEUTRAL : DARK_NEUTRAL);
  const [stack, setStack] = useState<{ current: Layer; previous: Layer | null; id: number }>(() => ({
    current: { fill },
    previous: null,
    id: 0,
  }));

  if (stack.current.fill !== fill) {
    setStack({ current: { fill }, previous: reduced ? null : stack.current, id: stack.id + 1 });
  }

  useEffect(() => {
    if (stack.previous === null) return;
    const id = stack.id;
    const timer = window.setTimeout(() => {
      setStack((state) => (state.id === id ? { ...state, previous: null } : state));
    }, DURATION_MS.settle);
    return () => window.clearTimeout(timer);
  }, [stack.id, stack.previous]);

  const crossFade = !reduced && stack.id > 0;
  const mask = variant === "banner" ? BANNER_MASK : undefined;

  return (
    <div
      aria-hidden="true"
      data-ambient-backdrop
      data-variant={variant}
      className={`pointer-events-none isolate overflow-hidden ${VARIANT_CLASS[variant]} ${className}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {stack.previous && <FlatLayer key={`p-${stack.id}`} fill={stack.previous.fill} animate={false} />}
      <FlatLayer key={stack.id} fill={stack.current.fill} animate={crossFade} />
    </div>
  );
}

export function AmbientSync() {
  const track = usePlayer(currentTrack);
  const pair = useArtworkPalette(paletteCoverFor(track));
  useEffect(() => applyAmbientVars(pair), [pair]);
  return null;
}

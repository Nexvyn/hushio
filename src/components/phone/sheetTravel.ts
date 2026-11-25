import { animate, motionValue, type AnimationPlaybackControls, type MotionValue } from "motion/react";
import { reducedMotion, SPRING_SHEET } from "../../lib/motion";
import { useUI } from "../../stores/ui";
import { viewportHeight } from "../../lib/viewport";
import type { SheetDriver } from "./useSheetDrag";

const MINI_FADE_END = 0.3;
const PAGE_SCALE_DROP = 0.06;
const PAGE_RADIUS_PX = 12;
const PAGE_SHADE = 0.4;
const COVER_RADIUS_PX = 12;
const COVER_ROUND_END = 0.5;
const SHEET_RADIUS_PX = 16;
const SHEET_SQUARE_FROM = 0.85;
const HANDOFF_AT = 0.001;
const TITLE_FADE_START = 0.7;
const TEXT_FADE_END = 0.25;
const TEXT_BLUR_PX = 4;
const TITLE_REVEAL_FROM = 0.7;

export type Box = { top: number; left: number; size: number };
export type Bounds = { top: number; left: number; width: number; height: number };
export type Geometry = { from: Box; to: Box };
export type Flight = { x: number; y: number; scale: number };
export type PageCard = { scale: number; radius: number; shade: number };
export type SheetClip = { top: number; right: number; bottom: number; left: number; radius: number };

export function travelPx(): number {
  return viewportHeight();
}

export const sheetY: MotionValue<number> = motionValue(travelPx());
export const sheetProgress: MotionValue<number> = motionValue(opennessOf(sheetY.get()));
sheetY.on("change", (y) => sheetProgress.set(opennessOf(y)));

let controls: AnimationPlaybackControls | null = null;
let token = 0;
let pending = 0;
let pulling = false;
let mounted = false;
let done: (() => void) | null = null;

export function setPulling(on: boolean): void {
  pulling = on;
}

function holdSheet(): void {
  token += 1;
  if (pending) cancelAnimationFrame(pending);
  pending = 0;
  controls?.stop();
  controls = null;
  done = null;
}

function finish(callback: (() => void) | null): void {
  done = null;
  callback?.();
}

export function glideSheet(target: number, velocity: number, onDone?: () => void): void {
  holdSheet();
  const goal = mounted ? target : travelPx();
  if (reducedMotion()) {
    sheetY.set(goal);
    onDone?.();
    return;
  }
  const id = token;
  done = onDone ?? null;
  const run = animate(sheetY, goal, { ...SPRING_SHEET, velocity });
  controls = run;
  run.finished.then(
    () => {
      if (id !== token) return;
      sheetY.set(goal);
      finish(done);
    },
    () => {},
  );
}

export function mountSheet(): void {
  holdSheet();
  mounted = true;
  if (pulling) return;
  sheetY.set(travelPx());
  if (reducedMotion()) {
    sheetY.set(0);
    return;
  }
  // Two frames: the first one paints the freshly mounted sheet, so the spring's opening frames are not eaten by it.
  pending = requestAnimationFrame(() => {
    pending = requestAnimationFrame(() => glideSheet(0, 0));
  });
}

export function unmountSheet(): void {
  holdSheet();
  mounted = false;
  sheetY.set(travelPx());
}

export function settleSheet(): void {
  const callback = done;
  holdSheet();
  callback?.();
  sheetY.set(mounted && useUI.getState().nowPlayingOpen ? 0 : travelPx());
}

export function watchSheetInterruptions(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "hidden") settleSheet();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", settleSheet);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", settleSheet);
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function opennessOf(y: number): number {
  return sheetProgressOf(y, travelPx());
}

export function sheetProgressOf(y: number, height: number): number {
  return height > 0 ? clamp01(1 - y / height) : 1;
}

export function miniFadeOf(openness: number): number {
  return 1 - clamp01(openness / MINI_FADE_END);
}

export function titleFadeOf(openness: number): number {
  return clamp01((openness - TITLE_FADE_START) / (1 - TITLE_FADE_START));
}

export function sheetWashOf(openness: number): number {
  return clamp01(openness / MINI_FADE_END);
}

export function textFadeOf(progress: number): number {
  return 1 - clamp01(progress / TEXT_FADE_END);
}

export function titleRevealOf(openness: number): number {
  return clamp01((openness - TITLE_REVEAL_FROM) / (1 - TITLE_REVEAL_FROM));
}

export function textBlurOf(amount: number, reduced: boolean): string {
  if (reduced) return "none";
  return `blur(${(TEXT_BLUR_PX * clamp01(amount)).toFixed(2)}px)`;
}

export function sheetClipOf(box: Bounds | null, width: number, height: number, openness: number, reduced = false): SheetClip {
  const p = clamp01(openness);
  if (reduced) return { top: 0, right: 0, bottom: 0, left: 0, radius: 0 };
  if (!box || width <= 0 || height <= 0) return { top: 0, right: 0, bottom: 0, left: 0, radius: 0 };
  const lift = clamp01((p - MINI_FADE_END) / (1 - MINI_FADE_END));
  return {
    top: box.top * (1 - p),
    right: (width - box.left - box.width) * (1 - p),
    bottom: (height - box.top - box.height) * (1 - lift),
    left: box.left * (1 - p),
    radius: 14 * (1 - p),
  };
}

export function sheetRadiusOf(openness: number): number {
  const t = clamp01((openness - SHEET_SQUARE_FROM) / (1 - SHEET_SQUARE_FROM));
  return SHEET_RADIUS_PX * (1 - t);
}

export function handedOff(openness: number): boolean {
  return openness > HANDOFF_AT;
}

export function pageCardOf(openness: number, reduced: boolean): PageCard {
  if (reduced) return { scale: 1, radius: 0, shade: 0 };
  const p = clamp01(openness);
  return { scale: 1 - PAGE_SCALE_DROP * p, radius: p > 0 ? PAGE_RADIUS_PX : 0, shade: PAGE_SHADE * p };
}

export function heldBox(box: Box, scale: number): Box {
  if (scale <= 0 || scale === 1) return box;
  const size = box.size / scale;
  const shift = (size - box.size) / 2;
  return { top: box.top - shift, left: box.left - shift, size };
}

export function coverRadiusOf(geometry: Geometry | null, openness: number): number {
  if (!geometry) return COVER_RADIUS_PX;
  const t = clamp01(openness / COVER_ROUND_END);
  return geometry.to.size / 2 + (COVER_RADIUS_PX - geometry.to.size / 2) * t;
}

export function coverFlight(geometry: Geometry | null, openness: number): Flight {
  if (!geometry) return { x: 0, y: 0, scale: 1 };
  const { from, to } = geometry;
  const rest = 1 - clamp01(openness);
  const ratio = from.size / to.size;
  return {
    x: rest * (from.left - to.left),
    y: rest * (from.top - to.top),
    scale: ratio + (1 - ratio) * (1 - rest),
  };
}

export function measureMini(): Box | null {
  const cover = document.querySelector<HTMLElement>("[data-mini-cover]");
  if (!cover) return null;
  const rect = cover.getBoundingClientRect();
  return rect.width > 0 ? { top: rect.top, left: rect.left, size: rect.width } : null;
}

export function measureMiniBar(): Bounds | null {
  const bar = document.querySelector<HTMLElement>("[data-mini-player]");
  if (!bar) return null;
  const rect = bar.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null;
}

export function measureCover(section: HTMLElement): Box | null {
  return measureWithin(section, "[data-art-centre]");
}

export function measureWithin(section: HTMLElement, selector: string): Box | null {
  const target = section.querySelector<HTMLElement>(selector);
  if (!target || target.offsetWidth === 0) return null;
  let top = 0;
  let left = 0;
  let node: HTMLElement | null = target;
  while (node && node !== section) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return node === section ? { top, left, size: target.offsetWidth } : null;
}

export const nowPlayingDriver: SheetDriver = { y: sheetY, height: travelPx, glide: glideSheet, hold: holdSheet };

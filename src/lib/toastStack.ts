import type { ToastKind } from "../stores/ui";

export type Placement = "top" | "bottom";

const STACK_VISIBLE = 3;
const STACK_TUCK_PX = 8;
const STACK_SHRINK = 0.06;

const DEFAULT_MS = 3500;
const ERROR_MS = 6000;
const ACTION_MS = 5000;

export function toastLifetime(kind: ToastKind, hasAction: boolean, duration?: number): number {
  if (duration && duration > 0) return duration;
  if (hasAction) return ACTION_MS;
  return kind === "error" ? ERROR_MS : DEFAULT_MS;
}

type Identity = { message: string; kind: ToastKind; action?: { label: string } };

export function sameToast(a: Identity, b: Identity): boolean {
  return a.message === b.message && a.kind === b.kind && (a.action?.label ?? "") === (b.action?.label ?? "");
}

export type StackSlot = { inFlow: boolean; visible: boolean; scale: number; y: number; zIndex: number };

export function stackSlot(depth: number, placement: Placement, expanded: boolean): StackSlot {
  const zIndex = 100 - depth;
  if (depth === 0 || expanded) return { inFlow: true, visible: true, scale: 1, y: 0, zIndex };
  const level = Math.min(depth, STACK_VISIBLE - 1);
  const direction = placement === "top" ? 1 : -1;
  return {
    inFlow: false,
    visible: depth < STACK_VISIBLE,
    scale: 1 - STACK_SHRINK * level,
    y: direction * STACK_TUCK_PX * level,
    zIndex,
  };
}

export type Lifetime = { remaining: number; startedAt: number | null };

export function pauseLifetime(life: Lifetime, now: number): Lifetime {
  if (life.startedAt === null) return life;
  return { remaining: Math.max(0, life.remaining - (now - life.startedAt)), startedAt: null };
}

export function resumeLifetime(life: Lifetime, now: number): Lifetime {
  if (life.startedAt !== null) return life;
  return { remaining: life.remaining, startedAt: now };
}

export function isSwipeDismiss(offset: { x: number; y: number }, velocity: { x: number; y: number }): boolean {
  return offset.y < -36 || velocity.y < -420 || Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 520;
}

export function progressPercent(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

type TrackLike = { title: string; artist?: string; thumb?: string | null };

export function trackToastOptions(track: TrackLike): { art?: string; detail: string } {
  return {
    art: track.thumb ?? undefined,
    detail: track.artist ? `${track.title} · ${track.artist}` : track.title,
  };
}

import type { Track } from "../types";

const RACK_SLOTS = [-2, -1, 0, 1] as const;
export type RackSlot = (typeof RACK_SLOTS)[number];

const SLOT_FRACTION = 0.6;
const SNAP_DISTANCE = 0.35;
const FLICK_VELOCITY = 0.6;
export const DRAG_START_PX = 6;
const RUBBER_C = 0.55;

const CENTRE_MAX = 420;
const CENTRE_FRACTION = 0.6;
const NEAR_SCALE = 0.78;
const FAR_SCALE = 0.66;
const ROTATE_DEG = 42;
const PERSPECTIVE_PX = 1200;
const NEAR_STRIP_PX = 70;
const FAR_STRIP_PX = 40;
const MIN_SIDE_PX = 96;

type Keyframe = { x: number; scale: number; rotate: number; opacity: number; brightness: number; depth: number };
export type RackLayout = { centre: number; keys: [Keyframe, Keyframe, Keyframe] };
export type RackSpan = { min: number; max: number };

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function projectedSpan(size: number, scale: number, rotate: number, x: number): RackSpan {
  const half = (size * scale) / 2;
  const angle = (rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let min = Infinity;
  let max = -Infinity;
  for (const edge of [-half, half]) {
    const depth = -edge * sin;
    const screen = ((edge * cos + x) * PERSPECTIVE_PX) / (PERSPECTIVE_PX - depth);
    min = Math.min(min, screen);
    max = Math.max(max, screen);
  }
  return { min, max };
}

function outerTranslation(size: number, scale: number, rotate: number, reach: number): number {
  const half = (size * scale) / 2;
  const angle = (rotate * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return Math.min(
    ...[-half, half].map((edge) => (reach * (PERSPECTIVE_PX + edge * sin)) / PERSPECTIVE_PX - edge * cos),
  );
}

export function rackLayout(width: number): RackLayout {
  const centre = Math.max(0, Math.min(CENTRE_MAX, width * CENTRE_FRACTION));
  const room = Math.max(0, width / 2 - centre / 2);
  const fit = Math.min(1, room / (NEAR_STRIP_PX + FAR_STRIP_PX));
  const near = NEAR_STRIP_PX * fit;
  const far = FAR_STRIP_PX * fit;
  const place = (scale: number, reach: number) => outerTranslation(centre, scale, -ROTATE_DEG, reach);
  return {
    centre,
    keys: [
      { x: 0, scale: 1, rotate: 0, opacity: 1, brightness: 1, depth: 30 },
      { x: place(NEAR_SCALE, centre / 2 + near), scale: NEAR_SCALE, rotate: ROTATE_DEG, opacity: 1, brightness: 0.7, depth: 20 },
      { x: place(FAR_SCALE, centre / 2 + near + far), scale: FAR_SCALE, rotate: ROTATE_DEG, opacity: 0.55, brightness: 0.55, depth: 10 },
    ],
  };
}

export function rackSpan(layout: RackLayout, distance: 0 | 1 | 2): RackSpan {
  const key = layout.keys[distance];
  return projectedSpan(layout.centre, key.scale, -key.rotate, key.x);
}

export function rackStyle(offset: number, layout: RackLayout) {
  const distance = Math.min(Math.abs(offset), 2);
  const sign = offset < 0 ? -1 : 1;
  const index = Math.min(Math.floor(distance), 1);
  const t = distance - index;
  const from = layout.keys[index];
  const to = layout.keys[index + 1];
  const x = sign * lerp(from.x, to.x, t);
  const rotate = -sign * lerp(from.rotate, to.rotate, t);
  const scale = lerp(from.scale, to.scale, t);
  return {
    transform: `translateX(${x}px) rotateY(${rotate}deg) scale(${scale})`,
    filter: `brightness(${lerp(from.brightness, to.brightness, t)})`,
    zIndex: Math.round(lerp(from.depth, to.depth, t)),
    opacity: lerp(from.opacity, to.opacity, t),
  };
}

export function rackNeighbours(queue: Track[], index: number): { slot: RackSlot; track: Track }[] {
  if (index < 0 || index >= queue.length) return [];
  return RACK_SLOTS.flatMap((slot) => {
    const track = queue[index + slot];
    return track ? [{ slot, track }] : [];
  });
}

export function rubberBandPosition(raw: number, min: number, max: number): number {
  if (raw < min) return min - overshoot(min - raw);
  if (raw > max) return max + overshoot(raw - max);
  return raw;
}

function overshoot(distance: number): number {
  return 1 - 1 / (distance * RUBBER_C + 1);
}

export function snapDirection({
  offset,
  velocity,
  canPrev,
  canNext,
}: {
  offset: number;
  velocity: number;
  canPrev: boolean;
  canNext: boolean;
}): -1 | 0 | 1 {
  if (offset >= SNAP_DISTANCE || (offset > 0 && velocity >= FLICK_VELOCITY)) return canNext ? 1 : 0;
  if (offset <= -SNAP_DISTANCE || (offset < 0 && velocity <= -FLICK_VELOCITY)) return canPrev ? -1 : 0;
  return 0;
}

export function slotPixels(rackWidth: number): number {
  return rackWidth * SLOT_FRACTION;
}

export function rackSlotShown(layout: RackLayout, slot: RackSlot): boolean {
  if (slot === 0) return true;
  const scale = Math.abs(slot) === 1 ? NEAR_SCALE : FAR_SCALE;
  return layout.centre * scale >= MIN_SIDE_PX;
}

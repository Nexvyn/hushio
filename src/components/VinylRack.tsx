import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { animate, motion, useMotionValue, type MotionValue } from "motion/react";
import { MusicNote01Icon } from "@hugeicons/core-free-icons";
import { upgradeArtwork } from "../lib/artwork";
import { glide, reducedMotion, settle } from "../lib/motion";
import {
  DRAG_START_PX,
  rackLayout,
  type RackLayout,
  rackNeighbours,
  rackSlotShown,
  rackStyle,
  rubberBandPosition,
  slotPixels,
  snapDirection,
} from "../lib/vinylRack";
import { usePlayer } from "../stores/player";
import { Icon } from "./Icon";

const SIDE_ART = 360;
const VELOCITY_WINDOW_MS = 100;
const FALLBACK_RACK_PX = 360;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type Drag = {
  id: number;
  startX: number;
  startOffset: number;
  slot: number;
  min: number;
  max: number;
  active: boolean;
  samples: { t: number; x: number }[];
};

type VinylRackProps = { cover: string; overlay?: ReactNode };

export function VinylRack({ cover, overlay }: VinylRackProps) {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const offset = useMotionValue(0);
  const rackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(0);

  const neighbours = rackNeighbours(queue, index);
  const canPrev = index > 0;
  const canNext = index + 1 < queue.length;
  const showRack = neighbours.some((item) => item.slot === 0);
  const layout = rackLayout(width || FALLBACK_RACK_PX);

  useLayoutEffect(() => {
    const node = rackRef.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [showRack]);

  function commit(steps: number, velocity = 0) {
    offset.stop();
    const before = usePlayer.getState().index;
    if (steps !== 0) usePlayer.getState().jumpTo(before + steps);
    const moved = usePlayer.getState().index - before;
    if (reducedMotion()) {
      offset.set(0);
      return;
    }
    offset.set(offset.get() - moved);
    animate(offset, 0, { ...(moved === 0 ? settle : glide), velocity });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (reducedMotion() || event.button !== 0) return;
    offset.stop();
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startOffset: offset.get(),
      slot: Math.max(1, slotPixels(layout.centre)),
      min: canPrev ? -1 : 0,
      max: canNext ? 1 : 0,
      active: false,
      samples: [{ t: event.timeStamp, x: event.clientX }],
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    const dx = event.clientX - current.startX;
    if (!current.active) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      current.active = true;
      suppressClick.current = true;
      rackRef.current?.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    const now = event.timeStamp;
    current.samples = [...current.samples, { t: now, x: event.clientX }].filter((sample) => now - sample.t <= VELOCITY_WINDOW_MS);
    offset.set(rubberBandPosition(current.startOffset - dx / current.slot, current.min, current.max));
  }

  function onRelease(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    drag.current = null;
    if (!current.active) return;
    setDragging(false);
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const elapsed = (last.t - first.t) / 1000;
    const pxPerSecond = elapsed > 0 ? (last.x - first.x) / elapsed : 0;
    const velocity = -pxPerSecond / current.slot;
    const direction = snapDirection({
      offset: offset.get(),
      velocity,
      canPrev: current.min < 0,
      canNext: current.max > 0,
    });
    commit(direction, velocity);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" && canPrev) {
      event.preventDefault();
      commit(-1);
    } else if (event.key === "ArrowRight" && canNext) {
      event.preventDefault();
      commit(1);
    }
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  if (!showRack) return null;

  return (
    <div
      ref={rackRef}
      role="group"
      tabIndex={0}
      aria-label="Now playing artwork, previous and next tracks"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      onClickCapture={onClickCapture}
      style={{ perspective: 1200, height: layout.centre }}
      className={`relative w-full touch-pan-y select-none rounded-[10px] ${FOCUS_RING}`}
    >
      {neighbours.filter(({ slot }) => rackSlotShown(layout, slot)).map(({ slot, track: item }) => (
        <RackCover key={slot} slot={slot} offset={offset} layout={layout} dragging={dragging}>
          {slot === 0 ? (
            <Face src={cover} overlay={overlay} />
          ) : (
            <button
              type="button"
              aria-label={`${slot < 0 ? "Play previous" : "Play next"}: ${item.title}`}
              onClick={() => commit(slot)}
              className={`group block h-full w-full rounded-[10px] ${FOCUS_RING}`}
            >
              <Face
                src={upgradeArtwork(item.thumb, SIDE_ART)}
                lazy
                side
                overlay={<RackCaption label={`${slot < 0 ? "Previous" : "Up next"} · ${item.title}`} />}
              />
            </button>
          )}
        </RackCover>
      ))}
    </div>
  );
}

function RackCover({
  slot,
  offset,
  layout,
  dragging,
  children,
}: {
  slot: number;
  offset: MotionValue<number>;
  layout: RackLayout;
  dragging: boolean;
  children: ReactNode;
}) {
  const transform = useMotionValue("");
  const filter = useMotionValue("");
  const zIndex = useMotionValue(0);
  const opacity = useMotionValue(1);
  useLayoutEffect(() => {
    const sync = (value: number) => {
      const style = rackStyle(slot - value, layout);
      transform.set(style.transform);
      filter.set(style.filter);
      zIndex.set(style.zIndex);
      opacity.set(style.opacity);
    };
    sync(offset.get());
    return offset.on("change", sync);
  }, [slot, layout, offset, transform, filter, zIndex, opacity]);
  return (
    <motion.div
      className="absolute top-0"
      style={{
        left: "50%",
        marginLeft: -layout.centre / 2,
        width: layout.centre,
        height: layout.centre,
        transform,
        filter,
        zIndex,
        opacity,
        willChange: dragging ? "transform, filter" : "auto",
      }}
    >
      {children}
    </motion.div>
  );
}

function RackCaption({ label }: { label: string }) {
  return (
    <span className="absolute inset-x-0 bottom-0 truncate px-3 pb-3 text-[12px] font-medium text-art opacity-0 group-hover:opacity-[0.72] group-focus-visible:opacity-[0.72]">
      {label}
    </span>
  );
}

function Face({ src, lazy, side, overlay }: { src: string; lazy?: boolean; side?: boolean; overlay?: ReactNode }) {
  return (
    <span className={`relative block aspect-square w-full overflow-hidden rounded-[10px] bg-wash outline outline-1 -outline-offset-1 outline-ink-1/10 ${side ? "shadow-[0_18px_40px_-20px_rgb(0_0_0/0.2)]" : "shadow-[0_18px_40px_-20px_rgb(0_0_0/0.35)]"}`}>
      {src ? (
        <img
          key={src}
          src={src}
          alt=""
          loading={lazy ? "lazy" : "eager"}
          decoding="async"
          draggable={false}
          className="animate-fade-in h-full w-full object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center text-ink-2">
          <Icon icon={MusicNote01Icon} />
        </span>
      )}
      {overlay}
    </span>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls, type MotionValue, type Variants } from "motion/react";
import { MusicNote01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { upgradeArtwork } from "../../lib/artwork";
import { PHONE_MS, fade, phoneSmooth, phoneTween, reducedMotion } from "../../lib/motion";
import { haptic } from "../../lib/haptics";
import { RUBBER_BAND, swipeAxis, trackSwipeChange, type Axis, type TrackChange } from "../../lib/trackSwipe";
import type { Track } from "../../types";

const GAP_PX = 16;
const COVER_SIZE = "min(calc(100vw - 48px), 44vh, 380px)";
const CHANGE_DISTANCE_SHARE = 0.25;
const CHANGE_SPEED_PX_S = 500;

type CarouselProps = {
  current: Track | null;
  prev: Track | null;
  next: Track | null;
  playing: boolean;
  onChange: (change: TrackChange) => void;
};

type Session = { x0: number; y0: number; base: number; lastX: number; lastT: number; velocity: number; axis: Axis | null };

function focus(distance: number, span: number): number {
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - Math.abs(distance) / span));
}

function coverVariants(reduced: boolean): Variants {
  return {
    initial: (instant: boolean) => (instant ? { opacity: 1, scale: 1 } : reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }),
    animate: { opacity: 1, scale: 1, transition: reduced ? fade : phoneTween(PHONE_MS.artIn) },
    exit: (instant: boolean) => ({ opacity: 0, transition: instant ? { duration: 0 } : phoneTween(PHONE_MS.artOut) }),
  };
}

function CoverFace({ track }: { track: Track }) {
  const src = track.thumb ? upgradeArtwork(track.thumb) : null;
  return (
    <span className="grid h-full w-full place-items-center overflow-hidden rounded-[12px] [corner-shape:squircle] bg-wash text-ink-2">
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Icon icon={MusicNote01Icon} />}
    </span>
  );
}

type SlotProps = {
  x: MotionValue<number>;
  side: -1 | 0 | 1;
  span: MutableRefObject<number>;
  slotRef?: MutableRefObject<HTMLDivElement | null>;
  children?: ReactNode;
};

function Slot({ x, side, span, slotRef, children }: SlotProps) {
  const scale = useTransform(x, (value) => 0.9 + 0.1 * focus(value + side * span.current, span.current));
  const opacity = useTransform(x, (value) => 0.6 + 0.4 * focus(value + side * span.current, span.current));
  return (
    <motion.div
      ref={slotRef}
      style={{ width: COVER_SIZE, aspectRatio: "1 / 1", scale, opacity }}
      className="relative shrink-0"
    >
      {children}
    </motion.div>
  );
}

export function ArtCarousel({ current, prev, next, playing, onChange }: CarouselProps) {
  const reduced = reducedMotion();
  const x = useMotionValue(0);
  const span = useRef(0);
  const centre = useRef<HTMLDivElement | null>(null);
  const session = useRef<Session | null>(null);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const [instant, setInstant] = useState(false);

  const measure = () => {
    const width = centre.current?.offsetWidth ?? 0;
    span.current = width > 0 ? width + GAP_PX : 0;
  };

  useLayoutEffect(measure, []);
  useEffect(() => setInstant(false), [current?.id]);

  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const active = session.current;
    session.current = null;
    if (!active || active.axis !== "x") return;
    const offset = reduced ? event.clientX - active.x0 : x.get();
    const cover = span.current - GAP_PX;
    const change = cancelled
      ? null
      : trackSwipeChange({
          offset,
          velocity: active.velocity,
          distance: cover * CHANGE_DISTANCE_SHARE,
          speed: CHANGE_SPEED_PX_S,
          canPrev: prev !== null,
          canNext: next !== null,
        });
    if (!change) {
      if (reduced) x.set(0);
      else controls.current = animate(x, 0, { ...phoneSmooth, velocity: active.velocity });
      return;
    }
    haptic("select");
    if (reduced) {
      onChange(change);
      return;
    }
    setInstant(true);
    x.set(offset + (change === "next" ? span.current : -span.current));
    onChange(change);
    controls.current = animate(x, 0, { ...phoneSmooth, velocity: active.velocity });
  };

  return (
    <div
      className="flex w-full touch-none justify-center gap-4"
      onPointerDown={(event) => {
        controls.current?.stop();
        measure();
        session.current = {
          x0: event.clientX,
          y0: event.clientY,
          base: x.get(),
          lastX: event.clientX,
          lastT: event.timeStamp,
          velocity: 0,
          axis: null,
        };
      }}
      onPointerMove={(event) => {
        const active = session.current;
        if (!active) return;
        const elapsed = event.timeStamp - active.lastT;
        if (elapsed > 0) active.velocity = ((event.clientX - active.lastX) / elapsed) * 1000;
        active.lastX = event.clientX;
        active.lastT = event.timeStamp;
        if (active.axis === null) {
          active.axis = swipeAxis(event.clientX - active.x0, event.clientY - active.y0);
          if (active.axis === null) return;
        }
        if (active.axis !== "x" || reduced) return;
        const raw = active.base + event.clientX - active.x0;
        const blocked = (raw < 0 && next === null) || (raw > 0 && prev === null);
        x.set(blocked ? raw * RUBBER_BAND : raw);
      }}
      onPointerUp={(event) => release(event, false)}
      onPointerCancel={(event) => release(event, true)}
    >
      <Slot x={x} side={-1} span={span}>
        {prev && <CoverFace track={prev} />}
      </Slot>
      <Slot x={x} side={0} span={span} slotRef={centre}>
        {current && (
          <motion.div
            className="h-full w-full"
            animate={{ scale: playing || reduced ? 1 : 0.9 }}
            transition={phoneSmooth}
          >
            <div className="grid h-full w-full">
              <AnimatePresence initial={false} custom={instant}>
                <motion.div
                  key={current.id}
                  className="col-start-1 row-start-1 h-full w-full"
                  custom={instant}
                  variants={coverVariants(reduced)}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <CoverFace track={current} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </Slot>
      <Slot x={x} side={1} span={span}>
        {next && <CoverFace track={next} />}
      </Slot>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls, type MotionValue, type Variants } from "motion/react";
import { MusicNote } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { thumbArtwork } from "../../lib/artwork";
import { artFitFor, type ArtFit } from "../../lib/artFit";
import { artPauseSpring, coverSnapSpring, fade, gate, phoneSmooth, phoneTween, reducedMotion } from "../../lib/motion";
import { haptic } from "../../lib/haptics";
import { rubberBand } from "../../lib/gesturePhysics";
import { swipeAxis, trackSwipeChange, type Axis, type TrackChange } from "../../lib/trackSwipe";
import type { Track } from "../../types";
import { CanvasVideo } from "../CanvasVideo";
import { useCanvasClip } from "../useCanvasClip";
import { useSettings } from "../../stores/settings";
import { markRevealed, useImageReveal } from "../useImageReveal";
import { viewportHeight, viewportWidth } from "../../lib/viewport";
import { VelocityTracker } from "../../lib/velocity";
import { INSET_BOTTOM, INSET_TOP } from "../../lib/phoneNav";

const GAP_PX = 24;
const COVER_SIZE = `min(88vw, calc(100vw - 48px), 56vh, calc(100dvh - ${INSET_TOP} - ${INSET_BOTTOM} - 404px), 460px)`;
const SKIP_PX = 72;
const DRAG_SHARE = 0.35;
export const PAUSED_SCALE = 0.86;
const MINI_THUMB_PX = 48;

function coverPixels(): number {
  return Math.min(viewportWidth() * 0.88, viewportHeight() * 0.56, 460);
}

export function warmCover(thumb: string | null | undefined): void {
  const src = thumb ? thumbArtwork(thumb, coverPixels()) : "";
  if (!src || typeof Image === "undefined") return;
  const image = new Image();
  image.src = src;
  image.decode?.().then(
    () => markRevealed(src),
    () => {},
  );
}

type CoverFlight = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  radius?: MotionValue<number>;
  fade?: MotionValue<number>;
};

type CarouselProps = {
  current: Track | null;
  prev: Track | null;
  next: Track | null;
  canPrev: boolean;
  canNext: boolean;
  playing: boolean;
  onChange: (change: TrackChange) => void;
  flight?: CoverFlight;
};

type Session = { x0: number; y0: number; base: number; axis: Axis | null; tracker: VelocityTracker };

function focus(distance: number, span: number): number {
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - Math.abs(distance) / span));
}

type CoverCustom = { instant: boolean };

const coverVariants: Variants = {
  initial: ({ instant }: CoverCustom) => (instant ? { opacity: 1 } : { opacity: 0 }),
  animate: { opacity: 1, transition: fade },
  exit: { opacity: 0, transition: phoneTween(160) },
};

type FaceProps = { track: Track; clip?: string | null; playing?: boolean; lead?: boolean; radius?: MotionValue<number> };

function CoverFace({ track, clip = null, playing = false, lead = false, radius }: FaceProps) {
  const src = track.thumb ? thumbArtwork(track.thumb, coverPixels()) : null;
  const small = lead && track.thumb ? thumbArtwork(track.thumb, MINI_THUMB_PX) : "";
  const reveal = useImageReveal(src);
  const [fit, setFit] = useState<ArtFit>("cover");
  return (
    <motion.span
      className={`relative grid h-full w-full place-items-center overflow-hidden rounded-[12px] [corner-shape:squircle] text-ink-2 ${fit === "contain" ? "bg-base" : "bg-wash"}`}
      style={radius ? { borderRadius: radius } : undefined}
    >
      {small && fit === "cover" && <img src={small} alt="" decoding="sync" className="absolute inset-0 h-full w-full object-cover" />}
      {src ? (
        <img
          loading={lead ? "eager" : "lazy"}
          decoding="async"
          src={src}
          alt=""
          onLoad={(event) => {
            setFit(artFitFor(event.currentTarget));
            reveal.onLoad();
          }}
          className={`relative h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${reveal.className}`}
        />
      ) : (
        <PhoneIcon icon={MusicNote} />
      )}
      {clip && <CanvasVideo key={clip} src={clip} playing={playing} className="absolute inset-0 h-full w-full object-cover" />}
    </motion.span>
  );
}

type SlotProps = {
  x: MotionValue<number>;
  side: -1 | 0 | 1;
  span: MutableRefObject<number>;
  fade: MotionValue<number>;
  slotRef?: MutableRefObject<HTMLDivElement | null>;
  artCentre?: boolean;
  children?: ReactNode;
};

function Slot({ x, side, span, fade: visible, slotRef, artCentre = false, children }: SlotProps) {
  const scale = useTransform(x, (value) => 0.9 + 0.1 * focus(value + side * span.current, span.current));
  const opacity = useTransform([x, visible], ([value, shown]: number[]) => (0.6 + 0.4 * focus(value + side * span.current, span.current)) * shown);
  return (
    <motion.div
      ref={slotRef}
      data-art-centre={artCentre ? "" : undefined}
      style={{ width: COVER_SIZE, aspectRatio: "1 / 1", scale, opacity }}
      className="relative shrink-0 will-change-[transform,opacity]"
    >
      {children}
    </motion.div>
  );
}

export function ArtCarousel({ current, prev, next, canPrev, canNext, playing, onChange, flight }: CarouselProps) {
  const reduced = reducedMotion();
  const x = useMotionValue(0);
  const solid = useMotionValue(1);
  const shown = flight?.fade ?? solid;
  const span = useRef(0);
  const centre = useRef<HTMLDivElement | null>(null);
  const session = useRef<Session | null>(null);
  const controls = useRef<AnimationPlaybackControls | null>(null);
  const pendingChange = useRef<TrackChange | null>(null);
  const [instant, setInstant] = useState(false);
  const animatedCovers = useSettings((state) => state.animatedCovers);
  const dataSaver = useSettings((state) => state.dataSaver);
  const clip = useCanvasClip(current, animatedCovers && !dataSaver);

  const measure = () => {
    const width = centre.current?.offsetWidth ?? 0;
    span.current = width > 0 ? width + GAP_PX : 0;
  };

  useLayoutEffect(measure, []);
  useEffect(() => setInstant(false), [current?.id]);

  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  useEffect(
    () => () => {
      const change = pendingChange.current;
      if (!change) return;
      pendingChange.current = null;
      changeRef.current(change);
    },
    [],
  );

  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const active = session.current;
    session.current = null;
    if (!active || active.axis !== "x") return;
    active.tracker.add(event.timeStamp, event.clientX);
    const velocity = active.tracker.velocity(event.timeStamp);
    const change = cancelled
      ? null
      : trackSwipeChange({
          offset: event.clientX - active.x0,
          velocity,
          distance: SKIP_PX,
          canPrev,
          canNext,
        });
    if (!change) {
      if (reduced) x.set(0);
      else controls.current = animate(x, 0, { ...coverSnapSpring, velocity: velocity * DRAG_SHARE });
      return;
    }
    haptic("tick");
    if (reduced) {
      onChange(change);
      return;
    }
    pendingChange.current = change;
    controls.current = animate(x, change === "next" ? -span.current : span.current, { ...phoneSmooth, velocity: velocity * DRAG_SHARE });
    controls.current.finished.then(
      () => {
        if (pendingChange.current !== change) return;
        pendingChange.current = null;
        setInstant(true);
        x.set(0);
        onChange(change);
      },
      () => {},
    );
  };

  const flightStyle = flight ? { x: flight.x, y: flight.y, scale: flight.scale, transformOrigin: "0px 0px" } : undefined;

  return (
    <div
      className="flex w-full touch-none justify-center gap-6"
      onPointerDown={(event) => {
        controls.current?.stop();
        const change = pendingChange.current;
        if (change) {
          pendingChange.current = null;
          x.set(x.get() + (change === "next" ? span.current : -span.current));
          setInstant(true);
          onChange(change);
        }
        measure();
        const tracker = new VelocityTracker();
        tracker.reset(event.timeStamp, event.clientX);
        session.current = {
          x0: event.clientX,
          y0: event.clientY,
          base: x.get(),
          axis: null,
          tracker,
        };
      }}
      onPointerMove={(event) => {
        const active = session.current;
        if (!active) return;
        active.tracker.add(event.timeStamp, event.clientX);
        if (active.axis === null) {
          active.axis = swipeAxis(event.clientX - active.x0, event.clientY - active.y0);
          if (active.axis === null) return;
        }
        if (active.axis !== "x" || reduced) return;
        const raw = active.base + (event.clientX - active.x0) * DRAG_SHARE;
        const blocked = (raw < 0 && !canNext) || (raw > 0 && !canPrev);
        x.set(blocked ? rubberBand(raw, viewportWidth()) : raw);
      }}
      onPointerUp={(event) => release(event, false)}
      onPointerCancel={(event) => release(event, true)}
    >
      <Slot x={x} side={-1} span={span} fade={shown}>
        {prev && <CoverFace track={prev} />}
      </Slot>
      <Slot x={x} side={0} span={span} fade={reduced ? shown : solid} slotRef={centre} artCentre>
        {current && (
          <motion.div className="relative h-full w-full will-change-transform" style={flightStyle}>
            <motion.div
              className="h-full w-full"
              animate={{ scale: playing || reduced ? 1 : PAUSED_SCALE }}
              transition={gate(reduced, artPauseSpring)}
            >
              <div className="grid h-full w-full">
                <AnimatePresence initial={false} custom={{ instant }}>
                  <motion.div
                    key={current.id}
                    className="col-start-1 row-start-1 h-full w-full"
                    custom={{ instant }}
                    variants={coverVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <CoverFace track={current} clip={clip} playing={playing} lead radius={flight?.radius} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </Slot>
      <Slot x={x} side={1} span={span} fade={shown}>
        {next && <CoverFace track={next} />}
      </Slot>
    </div>
  );
}

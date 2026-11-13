import { useRef, type PointerEvent } from "react";
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { MusicNote01Icon, NextIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { paletteCoverFor } from "../AmbientBackdrop";
import { PhoneIcon } from "./PhoneIcon";
import { PlayPauseGlyph } from "./PlayPauseGlyph";
import { useCoverFill } from "./useCoverFill";
import { shownDuration } from "../../lib/trackLength";
import { thumbArtwork } from "../../lib/artwork";
import { PHONE_MS, phoneSmooth, phoneSnappy, phoneTransition, phoneTween, reducedMotion } from "../../lib/motion";
import { MINI_GAP_DP, MINI_PLAYER_DP, TAB_BAR_DP, INSET_BOTTOM } from "../../lib/phoneNav";
import { swipeOf } from "../../lib/touchGesture";
import { RUBBER_BAND, neighbourTracks, swipeAxis, trackSwipeChange, type Axis, type TrackChange } from "../../lib/trackSwipe";
import { haptic } from "../../lib/haptics";
import { currentTrack, usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const FOLLOW_PX = 40;
const CHANGE_DISTANCE_PX = 32;
const CHANGE_SPEED_PX_S = 400;
const SLIDE_OUT_PX = 64;
const VELOCITY_STALE_MS = 100;

type Session = { x0: number; y0: number; base: number; lastX: number; lastT: number; velocity: number; axis: Axis | null };

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

export function MiniPlayer() {
  const track = usePlayer(currentTrack);
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const prevTrack = usePlayer((state) => state.prevTrack);
  const openNowPlaying = useUI((state) => state.openNowPlaying);
  const reduced = reducedMotion();
  const body = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  const session = useRef<Session | null>(null);
  const suppressClick = useRef(false);
  const control = useRef<AnimationPlaybackControls | null>(null);
  const token = useRef(0);
  const fill = useCoverFill(paletteCoverFor(track));
  const onArt = fill !== null;

  if (!track) return null;

  const neighbours = neighbourTracks(queue, index);
  const changeTrack = (change: TrackChange) => {
    haptic("select");
    if (change === "next") next(true);
    else prevTrack();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest("button");
    if (button && button !== body.current) return;
    control.current?.stop();
    token.current += 1;
    if (opacity.get() !== 1) animate(opacity, 1, phoneTween(PHONE_MS.tab));
    suppressClick.current = false;
    session.current = {
      x0: event.clientX,
      y0: event.clientY,
      base: x.get(),
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      axis: null,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active) return;
    const elapsed = event.timeStamp - active.lastT;
    if (elapsed > 0) active.velocity = ((event.clientX - active.lastX) / elapsed) * 1000;
    active.lastX = event.clientX;
    active.lastT = event.timeStamp;
    if (active.axis === null) {
      active.axis = swipeAxis(event.clientX - active.x0, event.clientY - active.y0);
      if (active.axis === null) return;
      suppressClick.current = true;
    }
    if (active.axis !== "x" || reduced) return;
    const dx = event.clientX - active.x0;
    const blocked = (dx < 0 && !neighbours.next) || (dx > 0 && !neighbours.prev);
    const raw = active.base + dx;
    x.set(clamp(blocked ? raw * RUBBER_BAND : raw, FOLLOW_PX));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const active = session.current;
    session.current = null;
    if (!active) return;
    if (active.axis !== "x") {
      if (!cancelled && swipeOf({ x: active.x0, y: active.y0 }, { x: event.clientX, y: event.clientY }) === "up") {
        openNowPlaying();
      }
      return;
    }
    const velocity = event.timeStamp - active.lastT > VELOCITY_STALE_MS ? 0 : active.velocity;
    const change = cancelled
      ? null
      : trackSwipeChange({
          offset: reduced ? event.clientX - active.x0 : x.get(),
          velocity,
          distance: CHANGE_DISTANCE_PX,
          speed: CHANGE_SPEED_PX_S,
          canPrev: neighbours.prev !== null,
          canNext: neighbours.next !== null,
        });
    if (!change) {
      if (!reduced) control.current = animate(x, 0, { ...phoneSmooth, velocity });
      return;
    }
    if (reduced) {
      changeTrack(change);
      return;
    }
    const id = ++token.current;
    const sign = change === "next" ? -1 : 1;
    animate(opacity, 0, phoneTween(PHONE_MS.tab));
    control.current = animate(x, sign * SLIDE_OUT_PX, { ...phoneSmooth, velocity });
    control.current.finished.then(() => {
      if (token.current !== id) return;
      changeTrack(change);
      x.set(0);
      opacity.set(1);
    });
  };

  const length = shownDuration(duration, track);
  const fraction = length > 0 ? Math.min(1, position / length) : 0;
  const artSrc = thumbArtwork(track.thumb, 48) || null;

  return (
    <motion.div
      role="region"
      aria-label="Mini player"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={phoneTransition(reduced, phoneSmooth)}
      className="absolute inset-x-2 z-20"
      style={{ bottom: `calc(${TAB_BAR_DP + MINI_GAP_DP}px + ${INSET_BOTTOM})` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerUp(event, false)}
      onPointerCancel={(event) => onPointerUp(event, true)}
    >
      <div
        className="relative flex items-center overflow-hidden rounded-[12px] bg-elevated pl-2 pr-1 motion-safe:transition-[background-color] motion-safe:duration-swap"
        style={{ height: MINI_PLAYER_DP, backgroundColor: fill ?? undefined }}
      >
        <motion.button
          ref={body}
          type="button"
          aria-label={`Open Now Playing: ${track.title}`}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            openNowPlaying();
          }}
          style={{ x, opacity }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={phoneSnappy}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-[12px] text-left ${FOCUS}`}
        >
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[6px] bg-wash text-ink-2">
            <AnimatePresence initial={false}>
              <motion.span
                key={track.id}
                className="col-start-1 row-start-1 grid h-full w-full place-items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduced ? { duration: PHONE_MS.artOut / 1000 } : phoneTween(PHONE_MS.text)}
              >
                {artSrc ? (
                  <img src={artSrc} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <Icon icon={MusicNote01Icon} />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="grid min-w-0 flex-1">
            <AnimatePresence initial={false}>
              <motion.span
                key={track.id}
                className="col-start-1 row-start-1 flex min-w-0 flex-col"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={reduced ? { duration: PHONE_MS.artOut / 1000 } : phoneTween(PHONE_MS.text)}
              >
                <span className={`truncate text-[14px] font-medium leading-[18px] ${onArt ? "text-art" : "text-ink-1"}`}>{track.title}</span>
                <span className={`truncate text-[13px] leading-[17px] ${onArt ? "text-art/[0.72]" : "text-ink-2"}`}>{track.artist}</span>
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
        <motion.button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause" : "Play"}
          onClick={() => {
            haptic("tick");
            toggle();
          }}
          whileTap={reduced ? undefined : { scale: 0.94 }}
          transition={phoneSnappy}
          className={`grid size-11 shrink-0 place-items-center rounded-full ${onArt ? "text-art" : "text-ink-1"} ${FOCUS}`}
        >
          <PlayPauseGlyph playing={playing} buffering={buffering} />
        </motion.button>
        <motion.button
          type="button"
          aria-label="Next"
          title="Next"
          onClick={() => {
            haptic("tick");
            next(true);
          }}
          whileTap={reduced ? undefined : { scale: 0.97 }}
          transition={phoneSnappy}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${onArt ? "text-art" : "text-ink-1"} ${FOCUS}`}
        >
          <PhoneIcon icon={NextIcon} />
        </motion.button>
        <div aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-[2px] overflow-hidden ${onArt ? "bg-art/[0.25]" : "bg-wash"}`}>
          <div
            data-progress-fill
            className={`h-full origin-left motion-safe:transition-transform motion-safe:duration-reading ${onArt ? "bg-art" : "bg-ink-1"}`}
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

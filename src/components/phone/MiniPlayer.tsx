import { useEffect, useRef, type PointerEvent } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { MusicNote, Heart } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { PlayPauseGlyph } from "./PlayPauseGlyph";
import { ToggleIcon } from "../motion/ToggleIcon";
import { shownDuration } from "../../lib/trackLength";
import { thumbArtwork } from "../../lib/artwork";
import { DURATION_MS, PHONE_MS, phoneSmooth, phoneSnappy, phoneTransition, phoneTween, pressTap, reducedMotion } from "../../lib/motion";
import { MINI_PLAYER_DP } from "../../lib/phoneNav";
import { pressMoved, swipeOf } from "../../lib/touchGesture";
import { neighbourTracks, type Axis } from "../../lib/trackSwipe";
import { projectDistance, rubberBand, rubberBandEdge } from "../../lib/gesturePhysics";
import { miniAxis } from "../../lib/gestureClaim";
import { playedFraction } from "../../lib/playbackProgress";
import { RAIL_COMMIT_SHARE, railChange } from "../../lib/phoneGestures";
import { haptic } from "../../lib/haptics";
import { VelocityTracker } from "../../lib/velocity";
import { glideSheet, handedOff, miniFadeOf, opennessOf, setPulling, sheetY, travelPx } from "./sheetTravel";
import { warmCover } from "./ArtCarousel";
import { warmPalette } from "./useHeldPalette";
import { paletteCoverFor } from "../AmbientBackdrop";
import { currentTrack, usePlayer } from "../../stores/player";
import { useLibrary } from "../../stores/library";
import { useUI } from "../../stores/ui";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
type Session = {
  x0: number;
  y0: number;
  base: number;
  tracker: VelocityTracker;
  trackerY: VelocityTracker;
  axis: Axis | null;
  pullFrom: number | null;
};

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
  const closeNowPlaying = useUI((state) => state.closeNowPlaying);
  const nowPlayingOpen = useUI((state) => state.nowPlayingOpen);
  const reduced = reducedMotion();
  const openness = useTransform(sheetY, opennessOf);
  const rowFade = useTransform(openness, miniFadeOf);
  const handed = useTransform(openness, (p) => (handedOff(p) ? 0 : 1));
  const body = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  const session = useRef<Session | null>(null);
  const suppressClick = useRef(false);
  const control = useRef<AnimationPlaybackControls | null>(null);
  const token = useRef(0);
  const liked = useLibrary((state) => state.liked.some((item) => item.id === track?.id));
  const toggleLike = useLibrary((state) => state.toggleLike);
  const length = shownDuration(duration, track);
  const fraction = playedFraction(position, length);
  const played = useMotionValue(fraction);
  const playedTrack = useRef(track?.id);

  useEffect(() => () => {
    token.current += 1;
    control.current?.stop();
  }, []);

  useEffect(() => {
    if (playedTrack.current !== track?.id) {
      playedTrack.current = track?.id;
      played.set(fraction);
      return;
    }
    if (reduced) {
      played.set(fraction);
      return;
    }
    const glide = animate(played, fraction, { duration: DURATION_MS.progress / 1000, ease: "linear" });
    return () => glide.stop();
  }, [fraction, track?.id, played, reduced]);

  useEffect(() => {
    if (track) warmPalette(paletteCoverFor(track));
  }, [track?.id]);

  if (!track) return null;

  const neighbours = neighbourTracks(queue, index);
  const changeTrack = (change: "next" | "prev") => {
    haptic("select");
    if (change === "next") next(true);
    else prevTrack();
  };

  const followPull = (event: PointerEvent<HTMLDivElement>, active: Session) => {
    if (active.pullFrom === null) {
      if (event.clientY >= active.y0 || nowPlayingOpen) return;
      active.pullFrom = event.clientY;
      setPulling(true);
      suppressClick.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      openNowPlaying();
      return;
    }
    const raw = travelPx() - (active.pullFrom - event.clientY);
    sheetY.set(rubberBandEdge(raw, travelPx()));
  };

  const releasePull = (event: PointerEvent<HTMLDivElement>, active: Session) => {
    setPulling(false);
    const velocity = active.trackerY.velocity(event.timeStamp);
    const open = sheetY.get() + projectDistance(velocity) < travelPx() / 2;
    if (open) glideSheet(0, velocity);
    else glideSheet(travelPx(), velocity, closeNowPlaying);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest("button");
    if (button && button !== body.current) return;
    warmCover(track.thumb);
    control.current?.stop();
    token.current += 1;
    if (opacity.get() !== 1) animate(opacity, 1, phoneTween(PHONE_MS.tab));
    suppressClick.current = false;
    const tracker = new VelocityTracker();
    tracker.reset(event.timeStamp, event.clientX);
    const trackerY = new VelocityTracker();
    trackerY.reset(event.timeStamp, event.clientY);
    session.current = {
      x0: event.clientX,
      y0: event.clientY,
      base: x.get(),
      tracker,
      trackerY,
      axis: null,
      pullFrom: null,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = session.current;
    if (!active) return;
    active.tracker.add(event.timeStamp, event.clientX);
    active.trackerY.add(event.timeStamp, event.clientY);
    if (pressMoved({ x: active.x0, y: active.y0 }, { x: event.clientX, y: event.clientY })) suppressClick.current = true;
    if (active.axis === null) {
      active.axis = miniAxis(event.clientX - active.x0, event.clientY - active.y0);
      if (active.axis === null) return;
    }
    if (active.axis === "y") {
      if (!reduced) followPull(event, active);
      return;
    }
    if (active.axis !== "x" || reduced) return;
    const dx = event.clientX - active.x0;
    const blocked = (dx < 0 && !neighbours.next) || (dx > 0 && !neighbours.prev);
    const raw = active.base + dx;
    x.set(clamp(blocked ? rubberBand(raw, event.currentTarget.clientWidth) : raw, event.currentTarget.clientWidth));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const active = session.current;
    session.current = null;
    if (!active) return;
    active.tracker.add(event.timeStamp, event.clientX);
    active.trackerY.add(event.timeStamp, event.clientY);
    if (active.pullFrom !== null) {
      releasePull(event, active);
      return;
    }
    if (active.axis !== "x") {
      if (!cancelled && swipeOf({ x: active.x0, y: active.y0 }, { x: event.clientX, y: event.clientY }) === "up") {
        openNowPlaying();
      }
      return;
    }
    const velocity = active.tracker.velocity(event.timeStamp);
    const size = event.currentTarget.clientWidth;
    const change = cancelled
      ? null
      : railChange({
          offset: reduced ? event.clientX - active.x0 : x.get(),
          velocity,
          threshold: size * RAIL_COMMIT_SHARE,
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
    control.current = animate(x, sign * size, { ...phoneSmooth, velocity });
    control.current.finished.then(() => {
      if (token.current !== id) return;
      changeTrack(change);
      x.set(-sign * size);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (token.current !== id) {
            x.set(0);
            opacity.set(1);
            return;
          }
          control.current = animate(x, 0, phoneSmooth);
          animate(opacity, 1, phoneTween(PHONE_MS.tab));
        }),
      );
    });
  };

  const artSrc = thumbArtwork(track.thumb, 48) || null;
  const coverClass = "grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-wash text-ink-2";
  const titleClass = `truncate text-body font-medium leading-[18px] text-ink-1`;
  const coverArt = (
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
          <img src={artSrc} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <PhoneIcon icon={MusicNote} />
        )}
      </motion.span>
    </AnimatePresence>
  );

  return (
    <motion.div
      role="region"
      data-no-edge-back
      aria-label="Mini player"
      data-mini-player
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={phoneTransition(reduced, phoneSmooth)}
      className="relative touch-none text-ink-1"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerUp(event, false)}
      onPointerCancel={(event) => onPointerUp(event, true)}
    >
      <motion.div
        className="relative flex items-center gap-1 overflow-hidden pl-3 pr-3 will-change-[opacity]"
        style={{ height: MINI_PLAYER_DP, opacity: rowFade }}
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
          whileTap={pressTap(reduced)}
          transition={phoneSnappy}
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-[12px] text-left will-change-[transform,opacity] ${FOCUS}`}
        >
          <motion.span data-mini-cover className={coverClass} style={{ opacity: handed }}>
            {coverArt}
          </motion.span>
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
                <span className={titleClass}>{track.title}</span>
                <span className="truncate text-meta leading-[17px] text-ink-2">{track.artist}</span>
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.button>
        <motion.button
          type="button"
          aria-label={liked ? "Remove from liked songs" : "Add to liked songs"}
          aria-pressed={liked}
          onClick={() => { haptic("tick"); toggleLike(track); }}
          whileTap={pressTap(reduced)}
          transition={phoneSnappy}
          className={`grid size-11 shrink-0 place-items-center rounded-full ${liked ? "text-accent" : "text-ink-2"} ${FOCUS}`}
        >
          <ToggleIcon kind="like" state={liked ? "on" : "off"}>
            <PhoneIcon icon={Heart} fill={liked ? "currentColor" : "none"} />
          </ToggleIcon>
        </motion.button>
        <motion.button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => { haptic("tick"); toggle(); }}
          whileTap={pressTap(reduced)}
          transition={phoneSnappy}
          className={`grid size-11 shrink-0 place-items-center rounded-[15px] bg-ink-1 text-surface ${FOCUS}`}
        >
          <PlayPauseGlyph playing={playing} buffering={buffering} />
        </motion.button>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-separator">
          <motion.div data-progress-fill className="h-full origin-left bg-[rgb(var(--accent))]" style={{ scaleX: played }} />
        </div>
      </motion.div>
    </motion.div>
  );
}

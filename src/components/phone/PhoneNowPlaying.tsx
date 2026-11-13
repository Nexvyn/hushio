import { useContext, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown01Icon,
  CastIcon,
  CheckmarkCircle02Icon,
  Download01Icon,
  Loading03Icon,
  Mic01Icon,
  MoonIcon,
  MoreHorizontalIcon,
  NextIcon,
  PreviousIcon,
  Queue01Icon,
  RepeatIcon,
  RepeatOne01Icon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { PhoneIcon } from "./PhoneIcon";
import { AmbientBackdrop, paletteCoverFor } from "../AmbientBackdrop";
import { LikeButton } from "../LikeButton";
import { PhoneLyrics } from "./PhoneLyrics";
import { ArtCarousel } from "./ArtCarousel";
import { PlayPauseGlyph, useLoopAllowed } from "./PlayPauseGlyph";
import { sheetReleaseCloses, useSheetDrag } from "./useSheetDrag";
import { haptic } from "../../lib/haptics";
import { castFromNowPlaying } from "../../lib/cast";
import { cancelDownload, isDownloadable, revealDownload, startDownload } from "../../lib/downloads";
import { fmtTime } from "../../lib/format";
import { AMBIENT_FALLBACK } from "../../lib/artworkPalette";
import { shownDuration } from "../../lib/trackLength";
import { useHeldPalette } from "./useHeldPalette";
import { OnArtContext } from "../../lib/onArt";
import { PHONE_MS, fade, gate, phoneSmooth, phoneSnappy, phoneTransition, phoneTween, reducedMotion } from "../../lib/motion";
import { INSET_BOTTOM, INSET_TOP } from "../../lib/phoneNav";
import { sleepMenuItems } from "../../lib/sleepActions";
import { songOf, trackMenuItems } from "../../lib/trackActions";
import { neighbourTracks } from "../../lib/trackSwipe";
import { useLibrary } from "../../stores/library";
import { currentTrack, type RepeatMode, usePlayer } from "../../stores/player";
import { type MenuItem, useUI } from "../../stores/ui";
import type { Track } from "../../types";

const SEEK_STEP_S = 5;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const ROW = "shrink-0 px-6";
type Page = "art" | "lyrics";
type ControlSize = 44 | 48 | 56;
const SIZE: Record<ControlSize, string> = { 44: "h-11 w-11", 48: "h-12 w-12", 56: "h-14 w-14" };

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: "Enable repeat",
  all: "Disable repeat",
  one: "Disable repeat one",
};

function toneFor(onArt: boolean, active: boolean, strong: boolean): string {
  const lit = active || strong;
  if (onArt) return lit ? "text-art" : "text-art/[0.6]";
  return lit ? "text-ink-1" : "text-ink-2";
}

type ControlProps = {
  label: string;
  icon: IconSvgElement;
  size?: ControlSize;
  glyph?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  strong?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  dot?: boolean;
  spin?: boolean;
};

function Control({
  label,
  icon,
  size = 48,
  glyph = 24,
  onClick,
  active = false,
  strong = false,
  pressed,
  disabled = false,
  dot = false,
  spin = false,
}: ControlProps) {
  const reduced = reducedMotion();
  const loop = useLoopAllowed();
  const onArt = useContext(OnArtContext);
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      whileTap={reduced || disabled ? undefined : { scale: 0.97 }}
      transition={phoneSnappy}
      className={`relative grid shrink-0 place-items-center rounded-full ${SIZE[size]} ${FOCUS} disabled:opacity-[var(--disabled-opacity)] ${toneFor(onArt, active, strong)}`}
    >
      <span className={spin && loop ? "grid animate-spin place-items-center" : "grid place-items-center"}>
        <PhoneIcon icon={icon} size={glyph} />
      </span>
      {dot && (
        <span
          aria-hidden="true"
          className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${onArt ? "bg-current" : "bg-accent"}`}
        />
      )}
    </motion.button>
  );
}

function DownloadButton({ track }: { track: Track | null }) {
  const item = useLibrary((state) => (track ? state.downloads[track.id] : undefined));
  if (!track || !isDownloadable(track.id)) return <span aria-hidden="true" className="h-11 w-11 shrink-0" />;
  const busy = item?.status === "queued" || item?.status === "downloading";
  const path = item?.status === "done" ? item.path : null;
  const percent = Math.round((item?.progress ?? 0) * 100);
  const label = busy ? `Downloading, ${percent}%` : path ? "Downloaded" : "Download";
  const onClick = () => {
    if (busy) void cancelDownload(track.id);
    else if (path) revealDownload(path);
    else void startDownload(track);
  };
  return (
    <Control
      label={label}
      size={44}
      icon={busy ? Loading03Icon : path ? CheckmarkCircle02Icon : Download01Icon}
      active={busy || Boolean(path)}
      spin={busy}
      onClick={onClick}
    />
  );
}

function SeekBar({ current }: { current: Track | null }) {
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const seek = usePlayer((state) => state.seek);
  const onArt = useContext(OnArtContext);
  const track = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const max = shownDuration(duration, current);
  const fraction = max > 0 ? Math.min(1, position / max) : 0;
  const shown = scrub ?? fraction;

  const shareAt = (clientX: number): number | null => {
    const element = track.current;
    if (!element || max <= 0) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const share = shareAt(event.clientX);
    if (share === null) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrub(share);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    const share = shareAt(event.clientX);
    if (share !== null) setScrub(share);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (scrub === null) return;
    const share = shareAt(event.clientX);
    if (share !== null) seek(share * max);
    setScrub(null);
    haptic("tick");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") seek(Math.min(max, position + SEEK_STEP_S));
    else if (event.key === "ArrowLeft") seek(Math.max(0, position - SEEK_STEP_S));
    else return;
    event.preventDefault();
  };

  const trackTone = onArt ? "bg-art/[0.25]" : "bg-wash";
  const fillTone = onArt ? "bg-art" : "bg-ink-1";

  return (
    <div className="shrink-0">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(Math.min(position, max))}
        aria-valuetext={`${fmtTime(position)} of ${fmtTime(max)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setScrub(null)}
        onKeyDown={onKeyDown}
        className={`relative flex h-7 w-full cursor-pointer touch-none items-center rounded-full ${FOCUS}`}
      >
        <div className={`relative h-1 w-full rounded-full ${trackTone}`}>
          <div className={`absolute inset-y-0 left-0 rounded-full ${fillTone}`} style={{ width: `${shown * 100}%` }} />
          <div
            aria-hidden="true"
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${fillTone}`}
            style={{ left: `${shown * 100}%` }}
          />
        </div>
      </div>
      <div className={`mt-1 flex justify-between text-[12px] leading-4 tabular-nums ${onArt ? "text-art/[0.72]" : "text-ink-2"}`}>
        <span>{fmtTime(position)}</span>
        <span>{max > 0 ? fmtTime(max) : "--:--"}</span>
      </div>
    </div>
  );
}

function NowPlayingSheet() {
  const track = usePlayer(currentTrack);
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const shuffle = usePlayer((state) => state.shuffle);
  const repeat = usePlayer((state) => state.repeat);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const prev = usePlayer((state) => state.prev);
  const prevTrack = usePlayer((state) => state.prevTrack);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const closeNowPlaying = useUI((state) => state.closeNowPlaying);
  const openPhoneQueue = useUI((state) => state.openPhoneQueue);
  const openContextMenu = useUI((state) => state.openContextMenu);
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const sheet = useRef<HTMLElement>(null);
  const [page, setPage] = useState<Page>("art");
  const drag = useSheetDrag(closeNowPlaying, (event) => event.clientY <= window.innerHeight / 2);
  const pull = useRef({ lastY: 0, lastT: 0, velocity: 0 });
  const dragHandlers = {
    ...drag.handlers,
    onPointerDown(event: PointerEvent) {
      pull.current = { lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
      drag.handlers.onPointerDown?.(event);
    },
    onPointerMove(event: PointerEvent) {
      const elapsed = event.timeStamp - pull.current.lastT;
      if (elapsed > 0) pull.current.velocity = ((event.clientY - pull.current.lastY) / elapsed) * 1000;
      pull.current.lastY = event.clientY;
      pull.current.lastT = event.timeStamp;
      drag.handlers.onPointerMove?.(event);
    },
    onPointerUp(event: PointerEvent) {
      const velocity = event.timeStamp - pull.current.lastT > 100 ? 0 : pull.current.velocity;
      if (sheetReleaseCloses(Math.max(0, drag.y.get()), window.innerHeight, velocity)) haptic("select");
      drag.handlers.onPointerUp?.(event);
    },
  };
  const reduced = reducedMotion();
  const empty = track === null;
  const playLabel = playing ? "Pause" : "Play";
  const neighbours = neighbourTracks(queue, index);
  const paletteSrc = paletteCoverFor(track);
  const held = useHeldPalette(paletteSrc);
  const palette = held ?? AMBIENT_FALLBACK;
  const onArt = held !== null && held !== AMBIENT_FALLBACK;

  const titleTone = onArt ? "text-art" : "text-ink-1";
  const artistTone = onArt ? "text-art/[0.72]" : "text-ink-2";
  const titleBarTone = onArt ? "text-art/[0.72]" : "text-ink-2";
  const likeTone = onArt ? (liked ? "!text-art" : "!text-art/[0.72]") : "";
  const playTone = onArt ? "bg-art text-base" : "bg-primary text-on-primary";

  const changeTrack = (change: "next" | "prev") => {
    if (change === "next") next(true);
    else prevTrack();
  };

  const openMenu = (event: MouseEvent<HTMLButtonElement>, items: MenuItem[]) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(rect.left, rect.top, items, { above: true });
  };

  return (
    <motion.section
      ref={sheet}
      role="dialog"
      aria-modal="true"
      aria-label="Now playing"
      initial={reduced ? { opacity: 0 } : undefined}
      animate={{ y: 0, opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { y: window.innerHeight }}
      transition={phoneTransition(reduced, phoneSmooth)}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-base text-ink-1"
      style={{ paddingTop: INSET_TOP, paddingBottom: INSET_BOTTOM, y: drag.y }}
    >
      {onArt && <AmbientBackdrop primary={palette.primary} src={paletteSrc} className="absolute inset-0" />}
      <OnArtContext.Provider value={onArt}>
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <header {...dragHandlers} className="flex h-12 shrink-0 items-center justify-between px-6">
            <Control label="Close Now Playing" icon={ArrowDown01Icon} size={44} active onClick={closeNowPlaying} />
            <span className={`min-w-0 truncate px-2 text-[13px] font-medium leading-[18px] ${titleBarTone}`}>Now playing</span>
            <Control
              label="More options"
              icon={MoreHorizontalIcon}
              size={44}
              active
              disabled={empty}
              onClick={(event) => {
                if (track) openMenu(event, trackMenuItems(songOf(track)));
              }}
            />
          </header>

          <div
            role="group"
            aria-label="Now playing pages"
            className="flex min-h-0 flex-1 flex-col px-6"
            {...(page === "art" ? dragHandlers : {})}
          >
            <motion.div
              key={page}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={gate(reduced, fade)}
              className="flex h-full w-full min-h-0 flex-col"
            >
              {page === "art" ? (
                <>
                  <div className="min-h-0 flex-1" />
                  <div className="shrink-0">
                    <ArtCarousel
                      current={track}
                      prev={neighbours.prev}
                      next={neighbours.next}
                      playing={playing}
                      onChange={changeTrack}
                    />
                  </div>
                  <div className="min-h-[24px] flex-1" />
                </>
              ) : (
                <PhoneLyrics />
              )}
            </motion.div>
          </div>

          <div className={`flex items-center gap-1 ${ROW}`}>
            <div className="grid min-w-0 flex-1">
              <AnimatePresence initial={false}>
                <motion.div
                  key={track?.id ?? "none"}
                  className="col-start-1 row-start-1 min-w-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reduced ? fade : phoneTween(PHONE_MS.text)}
                >
                  <p className={`truncate font-title text-[22px] font-bold leading-[28px] tracking-[-0.02em] ${titleTone}`}>{track?.title ?? "Nothing playing"}</p>
                  <p className={`truncate text-[16px] leading-[22px] ${artistTone}`}>{track?.artist ?? ""}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <LikeButton track={track} className={`h-11 w-11 ${likeTone}`} />
            <DownloadButton track={track} />
          </div>

          <div className={`mt-4 ${ROW}`}>
            <SeekBar current={track} />
          </div>

          <div role="group" aria-label="Transport" className={`mt-2 flex items-center justify-between ${ROW}`}>
            <Control
              label={shuffle ? "Disable shuffle" : "Enable shuffle"}
              icon={ShuffleIcon}
              size={48}
              active={shuffle}
              pressed={shuffle}
              dot={shuffle}
              onClick={() => {
                haptic("tick");
                toggleShuffle();
              }}
            />
            <Control
              label="Previous"
              icon={PreviousIcon}
              size={56}
              glyph={28}
              active
              disabled={empty}
              onClick={() => {
                haptic("tick");
                prev();
              }}
            />
            <motion.button
              type="button"
              aria-label={playLabel}
              title={playLabel}
              disabled={empty}
              onClick={() => {
                haptic("tick");
                toggle();
              }}
              whileTap={reduced || empty ? undefined : { scale: 0.94 }}
              transition={phoneSnappy}
              className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ${playTone} ${FOCUS} disabled:opacity-[var(--disabled-opacity)]`}
            >
              <PlayPauseGlyph playing={playing} buffering={buffering} size={28} />
            </motion.button>
            <Control
              label="Next"
              icon={NextIcon}
              size={56}
              glyph={28}
              active
              disabled={empty}
              onClick={() => {
                haptic("tick");
                next(true);
              }}
            />
            <Control
              label={REPEAT_LABEL[repeat]}
              icon={repeat === "one" ? RepeatOne01Icon : RepeatIcon}
              size={48}
              active={repeat !== "off"}
              pressed={repeat !== "off"}
              dot={repeat !== "off"}
              onClick={() => {
                haptic("tick");
                cycleRepeat();
              }}
            />
          </div>

          <div className={`mt-1 flex items-center justify-between pb-2 ${ROW}`}>
            <Control
              label="Lyrics"
              icon={Mic01Icon}
              size={48}
              strong
              pressed={page === "lyrics"}
              active={page === "lyrics"}
              dot={page === "lyrics"}
              onClick={() => setPage((current) => (current === "art" ? "lyrics" : "art"))}
            />
            <Control label="Queue" icon={Queue01Icon} size={48} strong onClick={openPhoneQueue} />
            <Control label="Sleep timer" icon={MoonIcon} size={48} strong onClick={(event) => openMenu(event, sleepMenuItems())} />
            <Control label="Cast" icon={CastIcon} size={48} strong disabled={empty} onClick={() => void castFromNowPlaying()} />
          </div>
        </div>
      </OnArtContext.Provider>
    </motion.section>
  );
}

export function PhoneNowPlaying() {
  const open = useUI((state) => state.nowPlayingOpen);
  return <AnimatePresence>{open && <NowPlayingSheet key="now-playing" />}</AnimatePresence>;
}

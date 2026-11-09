import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown01Icon,
  Loading03Icon,
  Mic01Icon,
  MoonIcon,
  MoreHorizontalIcon,
  MusicNote01Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  Queue01Icon,
  RepeatIcon,
  RepeatOne01Icon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "../Icon";
import { LikeButton } from "../LikeButton";
import { PhoneLyrics } from "./PhoneLyrics";
import { upgradeArtwork } from "../../lib/artwork";
import { fmtTime } from "../../lib/format";
import { fade, gate, instant, reducedMotion, settle } from "../../lib/motion";
import { INSET_BOTTOM, INSET_TOP } from "../../lib/phoneNav";
import { sleepMenuItems } from "../../lib/sleepActions";
import { sheetCloses, sheetTravel } from "../../lib/touchGesture";
import { songOf, trackMenuItems } from "../../lib/trackActions";
import { mergePointerHandlers, type PointerHandlers, usePointerSwipe } from "../../lib/usePointerSwipe";
import { currentTrack, type RepeatMode, usePlayer } from "../../stores/player";
import { type MenuItem, useUI } from "../../stores/ui";

const SEEK_STEP_S = 5;
type Page = "art" | "lyrics";

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: "Enable repeat",
  all: "Disable repeat",
  one: "Disable repeat one",
};

type ControlProps = {
  label: string;
  icon: IconSvgElement;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  dot?: boolean;
};

function Control({ label, icon, onClick, active = false, pressed, disabled = false, dot = false }: ControlProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] ${active ? "text-ink-1" : "text-ink-2"}`}
    >
      <Icon icon={icon} />
      {dot && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-1" />}
    </button>
  );
}

function SeekBar() {
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const seek = usePlayer((state) => state.seek);
  const track = useRef<HTMLDivElement>(null);
  const max = duration > 0 ? duration : 0;
  const fraction = max > 0 ? Math.min(1, position / max) : 0;

  const seekAt = (clientX: number) => {
    const element = track.current;
    if (!element || max <= 0) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return;
    const share = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(share * max);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") seek(Math.min(max, position + SEEK_STEP_S));
    else if (event.key === "ArrowLeft") seek(Math.max(0, position - SEEK_STEP_S));
    else return;
    event.preventDefault();
  };

  return (
    <div className="shrink-0 px-6">
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(Math.min(position, max))}
        aria-valuetext={`${fmtTime(position)} of ${fmtTime(duration)}`}
        onPointerDown={(event) => seekAt(event.clientX)}
        onKeyDown={onKeyDown}
        className="flex h-6 w-full cursor-pointer items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-wash">
          <div className="h-full origin-left bg-ink-1" style={{ transform: `scaleX(${fraction})` }} />
        </div>
      </div>
      <div className="flex justify-between text-[11.5px] tabular-nums text-ink-2">
        <span>{fmtTime(position)}</span>
        <span>{fmtTime(duration)}</span>
      </div>
    </div>
  );
}

function useSheetDrag(sheet: RefObject<HTMLElement | null>, onClose: () => void) {
  const session = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const [drag, setDrag] = useState<{ y: number; live: boolean } | null>(null);

  const handlers: PointerHandlers = {
    onPointerDown(event: PointerEvent) {
      if (event.clientY > window.innerHeight / 2) return;
      session.current = { startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0 };
    },
    onPointerMove(event: PointerEvent) {
      const current = session.current;
      if (!current) return;
      const elapsed = event.timeStamp - current.lastT;
      if (elapsed > 0) current.velocity = ((event.clientY - current.lastY) / elapsed) * 1000;
      current.lastY = event.clientY;
      current.lastT = event.timeStamp;
      setDrag({ y: sheetTravel(event.clientY - current.startY), live: true });
    },
    onPointerUp(event: PointerEvent) {
      const current = session.current;
      session.current = null;
      if (!current) return;
      const travel = sheetTravel(event.clientY - current.startY);
      const height = sheet.current?.getBoundingClientRect().height || window.innerHeight;
      if (sheetCloses(travel, height, current.velocity)) {
        setDrag((previous) => (previous ? { y: previous.y, live: false } : null));
        onClose();
      } else {
        setDrag(null);
      }
    },
    onPointerCancel() {
      session.current = null;
      setDrag(null);
    },
  };
  return { handlers, offset: drag?.y ?? 0, live: drag?.live ?? false };
}

function NowPlayingSheet() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const shuffle = usePlayer((state) => state.shuffle);
  const repeat = usePlayer((state) => state.repeat);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const prev = usePlayer((state) => state.prev);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const closeNowPlaying = useUI((state) => state.closeNowPlaying);
  const openContextMenu = useUI((state) => state.openContextMenu);
  const sheet = useRef<HTMLElement>(null);
  const [page, setPage] = useState<Page>("art");
  const drag = useSheetDrag(sheet, closeNowPlaying);
  const pageSwipe = usePointerSwipe((direction) => {
    if (direction === "left") setPage("lyrics");
    else if (direction === "right") setPage("art");
  });
  const reduced = reducedMotion();
  const transition = drag.live ? instant : reduced ? fade : settle;
  const empty = track === null;
  const artworkSrc = track?.thumb ? upgradeArtwork(track.thumb) : null;
  const playLabel = playing ? "Pause" : "Play";
  const sheetStyle: CSSProperties = { paddingTop: INSET_TOP, paddingBottom: INSET_BOTTOM };

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
      initial={reduced ? { opacity: 0 } : { y: "100%" }}
      animate={{ y: drag.offset, opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { y: "100%" }}
      transition={transition}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-base text-ink-1"
      style={sheetStyle}
    >
      <header {...drag.handlers} className="flex h-14 shrink-0 items-center justify-between px-1">
        <Control label="Close Now Playing" icon={ArrowDown01Icon} onClick={closeNowPlaying} />
        <span className="text-[13px] font-medium text-ink-1">Now playing</span>
        <Control
          label="More options"
          icon={MoreHorizontalIcon}
          disabled={empty}
          onClick={(event) => {
            if (track) openMenu(event, trackMenuItems(songOf(track)));
          }}
        />
      </header>

      <div
        role="group"
        aria-label="Now playing pages"
        className="flex min-h-0 flex-1 flex-col"
        {...mergePointerHandlers(...(page === "art" ? [drag.handlers, pageSwipe] : [pageSwipe]))}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6">
          <motion.div
            key={page}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={gate(reduced, fade)}
            className="flex h-full w-full items-center justify-center"
          >
            {page === "art" ? (
              <div
                className="grid max-h-full place-items-center overflow-hidden rounded-[9px] bg-wash text-ink-2"
                style={{ width: "min(calc(100vw - 48px), 420px)", aspectRatio: "1 / 1" }}
              >
                {artworkSrc ? (
                  <img src={artworkSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon icon={MusicNote01Icon} />
                )}
              </div>
            ) : (
              <PhoneLyrics />
            )}
          </motion.div>
        </div>
      </div>

      <div className="shrink-0 px-6 pt-3">
        <p className="truncate text-[22px] font-semibold leading-[28px] text-ink-1">
          {track?.title ?? "Nothing playing"}
        </p>
        <p className="truncate text-[13px] font-medium text-ink-1">{track?.artist ?? ""}</p>
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-1">
        <SeekBar />
        <div className="flex items-center justify-between px-3">
          <Control
            label={shuffle ? "Disable shuffle" : "Enable shuffle"}
            icon={ShuffleIcon}
            active={shuffle}
            pressed={shuffle}
            onClick={toggleShuffle}
          />
          <Control label="Previous" icon={PreviousIcon} disabled={empty} onClick={prev} />
          <button
            type="button"
            aria-label={playLabel}
            title={playLabel}
            disabled={empty}
            onClick={toggle}
            className="grid h-12 w-12 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)]"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-on-primary">
              {buffering ? (
                <span className="grid place-items-center motion-safe:animate-spin">
                  <Icon icon={Loading03Icon} />
                </span>
              ) : (
                <Icon icon={playing ? PauseIcon : PlayIcon} />
              )}
            </span>
          </button>
          <Control label="Next" icon={NextIcon} disabled={empty} onClick={() => next(true)} />
          <Control
            label={REPEAT_LABEL[repeat]}
            icon={repeat === "one" ? RepeatOne01Icon : RepeatIcon}
            active={repeat !== "off"}
            pressed={repeat !== "off"}
            onClick={cycleRepeat}
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-2">
          <LikeButton track={track} className="h-12 w-12" />
          <Control label="Queue" icon={Queue01Icon} disabled />
          <Control
            label="Lyrics"
            icon={Mic01Icon}
            pressed={page === "lyrics"}
            active={page === "lyrics"}
            dot={page === "lyrics"}
            onClick={() => setPage((current) => (current === "art" ? "lyrics" : "art"))}
          />
          <Control label="Sleep timer" icon={MoonIcon} onClick={(event) => openMenu(event, sleepMenuItems())} />
          <Control
            label="More"
            icon={MoreHorizontalIcon}
            disabled={empty}
            onClick={(event) => {
              if (track) openMenu(event, trackMenuItems(songOf(track)));
            }}
          />
        </div>
      </div>
    </motion.section>
  );
}

export function PhoneNowPlaying() {
  const open = useUI((state) => state.nowPlayingOpen);
  return <AnimatePresence>{open && <NowPlayingSheet key="now-playing" />}</AnimatePresence>;
}

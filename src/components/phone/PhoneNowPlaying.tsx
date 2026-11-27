import { useEffect, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue, usePresence, useTransform, type AnimationPlaybackControls } from "motion/react";
import { CaretDown, CaretUp, Screencast, DownloadSimple, DotsThree, SkipForward, SkipBack, Queue, Repeat, Shuffle, SpeakerHigh, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { AmbientBackdrop, isLightTheme, paletteCoverFor } from "../AmbientBackdrop";
import { LikeButton } from "../LikeButton";
import { PhoneLyrics } from "./PhoneLyrics";
import { ArtCarousel, PAUSED_SCALE } from "./ArtCarousel";
import { CoverLikeBurst } from "./CoverLikeBurst";
import { useCoverGestures } from "./useCoverGestures";
import { PlayPauseGlyph, useLoopAllowed } from "./PlayPauseGlyph";
import { ActiveDot, ToggleIcon } from "../motion/ToggleIcon";
import { DownloadRing } from "../motion/DownloadRing";
import type { ToggleKind } from "../../lib/toggleMotion";
import { sheetReleaseCloses, useSheetDrag, type SheetDriver } from "./useSheetDrag";
import { coverFlight, coverRadiusOf, glideSheet, heldBox, measureCover, measureMini, measureMiniBar, measureWithin, mountSheet, nowPlayingDriver, sheetClipOf, sheetProgress, sheetWashOf, sheetY, textBlurOf, textFadeOf, travelPx, unmountSheet, type Box, type Bounds, type Geometry } from "./sheetTravel";
import { PhoneQueueList } from "./PhoneQueueSheet";
import { Sheet } from "./Sheet";
import { PANEL_TRAVEL_SHARE, lyricsHintVisible, panelGestureMode, panelKindAt, panelReleaseTarget, scrollHoldsDrag, type PanelKind, type PanelMode } from "./nowPlayingPanel";
import { useTrackLyrics } from "../../lib/useTrackLyrics";
import { haptic } from "../../lib/haptics";
import { castFromNowPlaying, castToDevice, errorText } from "../../lib/cast";
import { castDevices, type CastDevice } from "../../lib/bridge";
import { isCasting, stopCastingFromApp } from "../../lib/castState";
import { cancelDownload, isDownloadable, revealDownload, startDownload } from "../../lib/downloads";
import { fmtTime } from "../../lib/format";
import { AMBIENT_FALLBACK } from "../../lib/artworkPalette";
import { shownDuration } from "../../lib/trackLength";
import { viewportHeight, viewportWidth } from "../../lib/viewport";
import { VelocityTracker } from "../../lib/velocity";
import { useHeldPalette } from "./useHeldPalette";
import { OnArtContext } from "../../lib/onArt";
import { DURATION_MS, EASE_IN, MARQUEE, QUEUE_EASE, SPRING_SHEET, fade, gate, phoneSnappy, phoneTween, pressTap, reducedMotion, scrubSpring } from "../../lib/motion";
import { INSET_BOTTOM, INSET_TOP } from "../../lib/phoneNav";
import { songOf, trackMenuItems } from "../../lib/trackActions";
import { neighbourTracks, swipeAxis, type Axis } from "../../lib/trackSwipe";
import { nowPlayingSourceName } from "../../lib/nowPlayingSource";
import { useLibrary } from "../../stores/library";
import { currentTrack, type RepeatMode, usePlayer } from "../../stores/player";
import { type MenuItem, useUI } from "../../stores/ui";
import type { Track } from "../../types";

const PANEL_HEADER_TOP = "top-12";

type PanelGesture = {
  down: PointerEvent;
  y0: number;
  tracker: VelocityTracker;
  axis: Axis | null;
  mode: PanelMode | null;
  anchorY: number;
  p0: number;
  startOpen: boolean;
  held: boolean;
  kind: PanelKind;
};

const closeTween: { current: AnimationPlaybackControls | null } = { current: null };

const nowPlayingSheet: SheetDriver = {
  y: nowPlayingDriver.y,
  height: nowPlayingDriver.height,
  hold() {
    closeTween.current?.stop();
    closeTween.current = null;
    nowPlayingDriver.hold();
  },
  glide(target, velocity, onDone, eased) {
    if (!eased || reducedMotion()) {
      nowPlayingDriver.glide(target, velocity, onDone);
      return;
    }
    nowPlayingDriver.hold();
    const run = animate(sheetY, target, { duration: DURATION_MS.rollOut / 1000, ease: EASE_IN });
    closeTween.current = run;
    run.finished.then(
      () => {
        if (closeTween.current !== run) return;
        closeTween.current = null;
        onDone?.();
      },
      () => {},
    );
  },
};

const textIn = (openness: number) => Math.min(1, Math.max(0, (openness - 0.4) / 0.6));

const SEEK_STEP_S = 5;
const SCRUB_IDLE_PX = 7;
const SCRUB_ACTIVE_PX = 12;
const EDGE_FADE = "linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 16px), transparent)";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const ROW = "shrink-0 px-6";
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
  icon: PhosphorIcon;
  size?: ControlSize;
  glyph?: number;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  strong?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  dot?: boolean;
  spin?: boolean;
  toggleKind?: ToggleKind;
  toggleState?: string;
  badge?: string;
  custom?: ReactNode;
  filled?: boolean;
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
  toggleKind,
  toggleState,
  badge,
  custom,
  filled = false,
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
      whileTap={disabled ? undefined : pressTap(reduced)}
      transition={phoneSnappy}
      className={`relative grid shrink-0 place-items-center rounded-full ${SIZE[size]} ${FOCUS} disabled:opacity-[var(--disabled-opacity)] ${toneFor(onArt, active, strong)}`}
    >
      {custom ?? (
        <span className={spin && loop ? "grid animate-spin place-items-center" : "grid place-items-center"}>
          {toggleKind ? (
            <ToggleIcon kind={toggleKind} state={toggleState ?? "off"} badge={badge}>
              <PhoneIcon icon={icon} size={glyph} fill={filled ? "fill" : "none"} />
            </ToggleIcon>
          ) : (
            <PhoneIcon icon={icon} size={glyph} fill={filled ? "fill" : "none"} />
          )}
        </span>
      )}
      {dot && <ActiveDot className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${onArt ? "bg-current" : "bg-accent"}`} />}
    </motion.button>
  );
}

function Marquee({ text, className, delayS }: { text: string; className: string; delayS: number }) {
  const reduced = reducedMotion();
  const frame = useRef<HTMLSpanElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const crawl = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    if (reduced) return;
    const measure = () => {
      const box = frame.current;
      const line = words.current;
      if (!box || !line) return;
      const width = line.offsetWidth;
      setOverflow(width > box.clientWidth ? width : 0);
    };
    measure();
    if (!frame.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [text, reduced]);

  useEffect(() => {
    const el = crawl.current;
    if (reduced || overflow === 0 || !el || typeof el.animate !== "function") return;
    const distance = overflow + MARQUEE.gapPx;
    const loopS = MARQUEE.restS + distance / MARQUEE.pxPerS;
    const rest = MARQUEE.restS / loopS;
    const animation = el.animate(
      [
        { transform: "translateX(0px)", offset: 0 },
        { transform: "translateX(0px)", offset: rest },
        { transform: `translateX(${-distance}px)`, offset: 1 },
      ],
      { duration: loopS * 1000, iterations: Infinity, delay: delayS * 1000 },
    );
    return () => animation.cancel();
  }, [overflow, reduced, delayS]);

  if (reduced) return <span className={`block truncate ${className}`}>{text}</span>;
  const crawling = overflow > 0;
  return (
    <span ref={frame} className="block overflow-hidden whitespace-nowrap" style={crawling ? { maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE } : undefined}>
      <span ref={crawl} className={`inline-flex ${crawling ? "w-max" : "w-full justify-center"}`}>
        <span ref={words} className={`inline-block truncate ${className}`}>
          {text}
        </span>
        {crawling && (
          <>
            <span aria-hidden="true" className="inline-block" style={{ width: MARQUEE.gapPx }} />
            <span aria-hidden="true" className={`inline-block truncate ${className}`}>
              {text}
            </span>
            <span aria-hidden="true" className="inline-block" style={{ width: MARQUEE.gapPx }} />
          </>
        )}
      </span>
    </span>
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
      icon={DownloadSimple}
      active={busy || Boolean(path)}
      custom={<DownloadRing busy={busy} done={Boolean(path)} progress={item?.progress ?? 0} size={24} idle={<PhoneIcon icon={DownloadSimple} size={24} />} />}
      onClick={onClick}
    />
  );
}

function LyricsHint({ visible, onOpen }: { visible: boolean; onOpen: () => void }) {
  return (
    <div data-lyrics-hint="" className={`flex flex-1 justify-center ${visible ? "" : "hidden"}`}>
      <button
        type="button"
        aria-label="Lyrics"
        onClick={onOpen}
        className={`flex min-h-11 items-center rounded-full px-4 text-meta font-medium text-ink-2 motion-safe:transition-transform motion-safe:duration-press motion-safe:active:scale-[0.97] ${FOCUS}`}
      >
        <span className="inline-flex items-center gap-1">
          <span>Lyrics</span>
          <PhoneIcon icon={CaretUp} />
        </span>
      </button>
    </div>
  );
}

function SeekBar({ current, slim = false }: { current: Track | null; slim?: boolean }) {
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const seek = usePlayer((state) => state.seek);
  const onArt = useContext(OnArtContext);
  const reduced = reducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const max = shownDuration(duration, current);
  const active = useRef<{ pointerId: number; trackId: string | undefined } | null>(null);
  const safePosition = Number.isFinite(position) ? Math.max(0, Math.min(max, position)) : 0;
  const fraction = max > 0 ? safePosition / max : 0;
  useEffect(() => { active.current = null; setScrub(null); }, [current?.id]);
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
    active.current = { pointerId: event.pointerId, trackId: current?.id };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrub(share);
    haptic("tick");
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!active.current || active.current.pointerId !== event.pointerId || active.current.trackId !== current?.id) return;
    const share = shareAt(event.clientX);
    if (share !== null) setScrub(share);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!active.current || active.current.pointerId !== event.pointerId || active.current.trackId !== current?.id) return;
    const share = shareAt(event.clientX);
    active.current = null;
    if (share !== null) seek(share * max);
    setScrub(null);
    haptic("tick");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (max <= 0) return;
    const value = shown * max;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") seek(Math.min(max, value + SEEK_STEP_S));
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") seek(Math.max(0, value - SEEK_STEP_S));
    else if (event.key === "Home") seek(0);
    else if (event.key === "End") seek(max);
    else return;
    event.preventDefault();
  };

  const trackTone = onArt ? "bg-art/[0.26]" : "bg-wash";
  const fillTone = onArt ? "bg-art/[0.92]" : "bg-ink-1";

  return (
    <div className={slim ? "shrink-0" : "shrink-0"}>
      <div
        ref={track}
        role="slider"
        tabIndex={max > 0 ? 0 : -1}
        aria-disabled={max <= 0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(shown * max)}
        aria-valuetext={`${fmtTime(shown * max)} of ${fmtTime(max)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { active.current = null; setScrub(null); }}
        onLostPointerCapture={() => { active.current = null; setScrub(null); }}
        onKeyDown={onKeyDown}
        className={`relative flex h-11 w-full cursor-pointer touch-none items-center rounded-full ${FOCUS}`}
      >
        <motion.div
          initial={false}
          style={{ height: SCRUB_ACTIVE_PX }}
          animate={{ scaleY: scrub === null ? SCRUB_IDLE_PX / SCRUB_ACTIVE_PX : 1 }}
          transition={gate(reduced, scrubSpring)}
          className={`relative w-full rounded-full ${trackTone}`}
        >
          <div
            className={`absolute inset-0 origin-left rounded-full ${fillTone} ${scrub === null && !reduced ? "transition-transform duration-reading ease-linear" : ""}`}
            style={{ transform: `scaleX(${shown})` }}
          />
        </motion.div>
      </div>
      {!slim && <div className={`mt-1 flex justify-between text-meta leading-4 tabular-nums ${onArt ? "text-art/[0.72]" : "text-ink-2"}`}>
        <span>{fmtTime(shown * max)}</span>
        <span>{max > 0 ? fmtTime(max) : "--:--"}</span>
      </div>}
    </div>
  );
}

function CastDeviceList({ onPick }: { onPick: () => void }) {
  const [devices, setDevices] = useState<CastDevice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      castDevices(true)
        .then((list) => {
          if (alive) setDevices(list);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
      void castDevices(false).catch(() => undefined);
    };
  }, []);
  if (failed) return <p className="text-center text-body font-medium">Cast isn't available on this device</p>;
  if (devices === null) return <p className="text-center text-body font-medium">Looking for devices...</p>;
  if (devices.length === 0) return <p className="text-center text-body font-medium">No devices found yet</p>;
  return (
    <ul className="flex w-full flex-col">
      {devices.map((device) => (
        <li key={device.id}>
          <button
            type="button"
            disabled={busy !== null}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-2 text-left text-body"
            onClick={() => {
              setBusy(device.id);
              castToDevice(device.id, device.selected)
                .then(onPick)
                .catch((error: unknown) => useUI.getState().toast(`Couldn't cast this song: ${errorText(error)}`, "error"))
                .finally(() => setBusy(null));
            }}
          >
            <span className="min-w-0 truncate font-medium">{device.name}</span>
            <span className="shrink-0 text-meta text-ink-2">{device.selected ? "Connected" : busy === device.id ? "Connecting..." : ""}</span>
          </button>
        </li>
      ))}
    </ul>
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
  const closePhoneQueue = useUI((state) => state.closePhoneQueue);
  const queueOpen = useUI((state) => state.phoneQueueOpen);
  const lyricsOpen = useUI((state) => state.phoneLyricsOpen);
  const openPhoneLyrics = useUI((state) => state.openPhoneLyrics);
  const closePhoneLyrics = useUI((state) => state.closePhoneLyrics);
  const panel: PanelKind | null = queueOpen ? "queue" : lyricsOpen ? "lyrics" : null;
  const duration = usePlayer((state) => state.duration);
  const lyricsState = useTrackLyrics(track, duration);
  const hintVisible = lyricsHintVisible(lyricsState);
  const openContextMenu = useUI((state) => state.openContextMenu);
  const coverGestures = useCoverGestures(track, (point) => {
    if (track) openContextMenu(point.x, point.y, trackMenuItems(songOf(track)), { above: true });
  });
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const playlists = useLibrary((state) => state.playlists);
  const likedTracks = useLibrary((state) => state.liked);
  const playingFrom = usePlayer((state) => state.playingFrom);
  const sheet = useRef<HTMLElement>(null);
  const [panelKind, setPanelKind] = useState<PanelKind | null>(null);
  const [castSheetOpen, setCastSheetOpen] = useState(false);
  const drag = useSheetDrag(closeNowPlaying, () => "grab", nowPlayingSheet);
  const geometry = useRef<Geometry | null>(null);
  const clipBounds = useRef<Bounds | null>(null);
  const screenSize = useRef({ width: 0, height: 0 });
  const openness = sheetProgress;
  const coverRadius = useTransform(openness, (p) => coverRadiusOf(geometry.current, p));
  const clipPath = useMotionValue("inset(0px 0px 0px 0px round 0px)");
  const clipAt = (p: number) => {
    const reduced = reducedMotion();
    const clip = sheetClipOf(clipBounds.current, screenSize.current.width, screenSize.current.height, p, reduced);
    return `inset(${clip.top}px ${clip.right}px ${clip.bottom}px ${clip.left}px round ${clip.radius}px)`;
  };
  const flightX = useTransform(openness, (p) => coverFlight(geometry.current, p).x);
  const flightY = useTransform(openness, (p) => coverFlight(geometry.current, p).y);
  const flightScale = useTransform(openness, (p) => coverFlight(geometry.current, p).scale);
  const panelP = useMotionValue(0);
  const panelCtl = useRef<AnimationPlaybackControls | null>(null);
  const panelGeo = useRef<{ from: Box; to: Box } | null>(null);
  const gesture = useRef<PanelGesture | null>(null);
  const panelFlightX = useTransform(panelP, (p) => (panelGeo.current ? p * (panelGeo.current.to.left - panelGeo.current.from.left) : 0));
  const panelFlightY = useTransform(panelP, (p) => (panelGeo.current ? p * (panelGeo.current.to.top - panelGeo.current.from.top) : 0));
  const panelFlightScale = useTransform(panelP, (p) => (panelGeo.current ? 1 + p * (panelGeo.current.to.size / panelGeo.current.from.size - 1) : 1));
  const coverX = useTransform([flightX, panelFlightX], ([a, b]: number[]) => a + b);
  const coverY = useTransform([flightY, panelFlightY], ([a, b]: number[]) => a + b);
  const coverScale = useTransform([flightScale, panelFlightScale], ([a, b]: number[]) => a * b);
  const neighbourFade = useTransform(panelP, (p) => 1 - p);
  const contentFade = useTransform(openness, textIn);
  const controlFade = useTransform(openness, textIn);
  const washOpacity = useTransform(openness, sheetWashOf);
  const lowerFade = useTransform([panelP, controlFade], ([panelProgress, sheetProgress]: number[]) => Math.min(1 - Math.min(1, panelProgress / 0.4), sheetProgress));
  const overlayOpacity = useTransform(panelP, [0, 0.2], [0, 1]);
  const panelListY = useTransform(panelP, [0, 1], ["100%", "0%"]);
  const releaseVelocity = useRef<number | null>(null);
  const titleOpacity = useTransform([openness, panelP], ([p, q]: number[]) => textIn(p) * textFadeOf(q));
  const titleFilter = useTransform([openness, panelP], ([p, q]: number[]) => textBlurOf(Math.max(1 - textIn(p), 1 - textFadeOf(q)), reducedMotion()));

  const measurePanel = () => {
    const section = sheet.current;
    const from = section ? measureCover(section) : null;
    const to = section ? measureWithin(section, "[data-queue-thumb]") : null;
    panelGeo.current = from && to && !reducedMotion() ? { from, to } : null;
  };

  const settlePanel = (target: 0 | 1, velocity?: number) => {
    panelCtl.current?.stop();
    const from = panelP.get();
    if (from === target) return;
    if (target === 1) measurePanel();
    if (reducedMotion()) {
      panelP.set(target);
      return;
    }
    panelCtl.current =
      velocity === undefined
        ? animate(panelP, target, { duration: (DURATION_MS.queue * Math.abs(target - from)) / 1000, ease: QUEUE_EASE })
        : animate(panelP, target, { ...SPRING_SHEET, velocity: velocity / (viewportHeight() * PANEL_TRAVEL_SHARE) });
  };

  const openPanelKind = (kind: PanelKind) => {
    if (kind === "queue") {
      closePhoneLyrics();
      openPhoneQueue();
    } else {
      closePhoneQueue();
      openPhoneLyrics();
    }
  };

  const commitPanel = (target: 0 | 1, velocity: number, kind: PanelKind) => {
    if (target === 1 && !panel) {
      releaseVelocity.current = velocity;
      openPanelKind(kind);
    } else if (target === 0 && panel) {
      releaseVelocity.current = velocity;
      closePhoneQueue();
      closePhoneLyrics();
    } else {
      settlePanel(target, velocity);
    }
  };

  useEffect(() => {
    if (panel) setPanelKind(panel);
    settlePanel(panel ? 1 : 0, releaseVelocity.current ?? undefined);
    releaseVelocity.current = null;
  }, [panel]);

  useEffect(() => {
    if (!lyricsOpen) lyricsState.reload();
  }, [lyricsOpen]);

  useEffect(
    () => () => {
      panelCtl.current?.stop();
      closePhoneQueue();
      closePhoneLyrics();
    },
    [closePhoneQueue, closePhoneLyrics],
  );

  useLayoutEffect(() => {
    const section = sheet.current;
    clipBounds.current = measureMiniBar();
    screenSize.current = { width: viewportWidth(), height: viewportHeight() };
    const thumb = measureMini();
    const from = thumb && heldBox(thumb, usePlayer.getState().playing ? 1 : PAUSED_SCALE);
    const to = section ? measureCover(section) : null;
    geometry.current = !reducedMotion() && from && to ? { from, to } : null;
    clipPath.set(clipAt(openness.get()));
    mountSheet();
    return unmountSheet;
  }, []);

  useEffect(() => openness.on("change", (p) => clipPath.set(clipAt(p))), [openness, clipPath]);

  const [present, safeToRemove] = usePresence();
  const leaving = useRef(false);
  useEffect(() => {
    if (present) {
      if (leaving.current) {
        nowPlayingSheet.hold();
        glideSheet(0, 0);
      }
      leaving.current = false;
      return;
    }
    leaving.current = true;
    if (reducedMotion()) {
      const element = sheet.current;
      if (!element) {
        safeToRemove();
        return;
      }
      const exit = animate(element, { opacity: 0 }, fade);
      exit.finished.then(
        () => {
          sheetY.set(travelPx());
          safeToRemove();
        },
        () => {},
      );
      return () => exit.stop();
    }
    if (sheetY.get() >= travelPx() - 1) safeToRemove();
    else glideSheet(travelPx(), 0, safeToRemove);
  }, [present]);
  const pull = useRef(new VelocityTracker());
  const sheetHandlers = {
    ...drag.handlers,
    onPointerDown(event: PointerEvent) {
      pull.current.reset(event.timeStamp, event.clientY);
      drag.handlers.onPointerDown?.(event);
    },
    onPointerMove(event: PointerEvent) {
      pull.current.add(event.timeStamp, event.clientY);
      drag.handlers.onPointerMove?.(event);
    },
    onPointerUp(event: PointerEvent) {
      pull.current.add(event.timeStamp, event.clientY);
      const velocity = pull.current.velocity(event.timeStamp);
      if (sheetReleaseCloses(Math.max(0, sheetY.get()), travelPx(), velocity)) haptic("select");
      drag.handlers.onPointerUp?.(event);
    },
  };
  const artHandlers = {
    onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !event.currentTarget.contains(target)) {
        gesture.current = null;
        return;
      }
      if (target instanceof Element && target.closest('[role="slider"]')) {
        gesture.current = null;
        return;
      }
      const scroller = event.currentTarget.querySelector<HTMLElement>("[data-lyrics-scroll]");
      const tracker = new VelocityTracker();
      tracker.reset(event.timeStamp, event.clientY);
      gesture.current = {
        down: event,
        y0: event.clientY,
        tracker,
        axis: null,
        mode: null,
        anchorY: event.clientY,
        p0: 0,
        startOpen: panel !== null,
        held: scrollHoldsDrag(scroller ? scroller.scrollTop : null),
        kind: panelKindAt(event.clientX, viewportWidth()),
      };
    },
    onPointerMove(event: PointerEvent) {
      const g = gesture.current;
      if (!g) return;
      g.tracker.add(event.timeStamp, event.clientY);
      if (g.axis === null) {
        g.axis = swipeAxis(event.clientX - g.down.clientX, event.clientY - g.y0);
        if (g.axis === null) return;
      }
      if (g.axis !== "y") return;
      if (g.mode === null) {
        g.mode = panelGestureMode({ open: panel !== null, movedUp: event.clientY < g.y0, held: g.held });
        if (g.mode === "panel") {
          setPanelKind(panel ?? g.kind);
          measurePanel();
        } else if (g.mode === "sheet") {
          sheetHandlers.onPointerDown(g.down);
        }
        g.anchorY = event.clientY;
        g.p0 = panelP.get();
        panelCtl.current?.stop();
      }
      if (g.mode === "scroll") return;
      if (g.mode === "sheet") {
        sheetHandlers.onPointerMove(event);
        return;
      }
      const travel = viewportHeight() * PANEL_TRAVEL_SHARE;
      panelP.set(Math.min(1, Math.max(0, g.p0 + (g.anchorY - event.clientY) / travel)));
    },
    onPointerUp(event: PointerEvent) {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.mode === null || g.mode === "scroll") return;
      if (g.mode === "sheet") {
        sheetHandlers.onPointerUp(event);
        return;
      }
      g.tracker.add(event.timeStamp, event.clientY);
      const velocity = g.tracker.velocity(event.timeStamp);
      commitPanel(panelReleaseTarget({ progress: panelP.get(), start: g.p0, velocity, startOpen: g.startOpen }), -velocity, g.kind);
    },
    onPointerCancel(event: PointerEvent) {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.mode === null || g.mode === "scroll") return;
      if (g.mode === "sheet") sheetHandlers.onPointerCancel?.(event);
      else settlePanel(g.startOpen ? 1 : 0);
    },
  };
  const reduced = reducedMotion();
  const empty = track === null;
  const playLabel = playing ? "Pause" : "Play";
  const canSwipe = neighbourTracks(queue, index);
  const peekSource = playingFrom === "__liked__" ? likedTracks : (playlists.find((item) => item.id === playingFrom)?.tracks ?? []);
  const neighbours = neighbourTracks(queue, index, peekSource);
  const paletteSrc = paletteCoverFor(track);
  const held = useHeldPalette(paletteSrc);
  const palette = held ?? AMBIENT_FALLBACK;
  const onArt = held !== null && held !== AMBIENT_FALLBACK;
  const lightTheme = isLightTheme();

  const titleTone = onArt ? "text-art" : "text-ink-1";
  const artistTone = onArt ? "text-art/[0.72]" : "text-ink-2";
  const titleBarTone = onArt ? "text-art/[0.72]" : "text-ink-2";
  const likeTone = onArt ? (liked ? "!text-art" : "!text-art/[0.72]") : "";
  const playTone = onArt ? "bg-art text-base" : "bg-primary text-on-primary";
  const sourceName = nowPlayingSourceName(playingFrom, track?.album ?? undefined, (id) => playlists.find((item) => item.id === id)?.name);

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
      initial={reduced ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={reduced ? { opacity: 0 } : undefined}
      transition={fade}
      style={{ clipPath }}
      className={`fixed inset-0 z-40 overflow-hidden text-ink-1 will-change-[clip-path,opacity] ${present ? "" : "pointer-events-none"}`}
    >
      <motion.div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-base" style={{ opacity: washOpacity }}>
        {onArt && !lightTheme && <AmbientBackdrop variant="banner" primary={palette.primary} src={paletteSrc} />}
      </motion.div>
      <OnArtContext.Provider value={onArt}>
        <div data-sheet-body className="relative z-10 flex h-full flex-col" style={{ paddingTop: INSET_TOP, paddingBottom: INSET_BOTTOM }}>
          <div className="relative flex min-h-0 flex-1 flex-col">
              <motion.header {...artHandlers} style={{ opacity: contentFade }} className="flex h-12 shrink-0 touch-none items-center justify-between px-6">
                <Control label="Close Now Playing" icon={CaretDown} size={44} active onClick={drag.closeEased} />
                <div className="flex min-w-0 flex-col items-center px-2 text-center">
                  <span className={`text-meta font-medium leading-[18px] ${titleBarTone}`}>Now playing</span>
                  <span className={`max-w-full truncate text-meta leading-4 ${artistTone}`}>{sourceName}</span>
                </div>
                <Control
                  label="More options"
                  icon={DotsThree}
                  size={44}
                  active
                  disabled={empty}
                  onClick={(event) => {
                    if (track) openMenu(event, trackMenuItems(songOf(track)));
                  }}
                />
              </motion.header>

            <div className="flex min-h-0 flex-col">
              <motion.div
                role="group"
                aria-label="Now playing pages"
                className="flex touch-none flex-col px-6"
                {...artHandlers}
              >
                <div className="flex h-full w-full min-h-0 flex-col">
                  <div className="h-6 shrink-0" />
                  <div className="relative shrink-0" {...coverGestures.handlers}>
                    {onArt && lightTheme && (
                      <div aria-hidden="true" className="pointer-events-none absolute -inset-8 overflow-hidden rounded-[32px]">
                        <AmbientBackdrop primary={palette.primary} src={paletteSrc} lightOpacity={0.04} />
                      </div>
                    )}
                    <ArtCarousel
                      current={track}
                      prev={neighbours.prev}
                      next={neighbours.next}
                      canPrev={canSwipe.prev !== null}
                      canNext={canSwipe.next !== null}
                      playing={playing}
                      onChange={changeTrack}
                      flight={{ x: coverX, y: coverY, scale: coverScale, radius: coverRadius, fade: neighbourFade }}
                    />
                    <CoverLikeBurst count={coverGestures.burst} />
                  </div>
                  <div className="h-6 shrink-0" />
                </div>
              </motion.div>
            </div>

            <motion.div className="flex min-h-0 flex-1 touch-none flex-col will-change-[opacity]" style={{ opacity: lowerFade }} {...artHandlers}>
            <div className={`flex items-center gap-2 ${ROW}`}>
                  <DownloadButton track={track} />
                <motion.div className="grid min-w-0 flex-1 text-center" style={{ opacity: titleOpacity, filter: titleFilter }}>
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={track?.id ?? "none"}
                      className="col-start-1 row-start-1 min-w-0"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={reduced ? fade : phoneTween(160)}
                    >
                      <p className="block">
                        <Marquee
                          text={track?.title ?? "Nothing playing"}
                          className={`text-center font-title text-section font-semibold leading-[28px] tracking-[-0.02em] ${titleTone}`}
                          delayS={0}
                        />
                      </p>
                        <Marquee text={track?.artist ?? ""} className={`text-center text-body leading-[22px] ${artistTone}`} delayS={MARQUEE.artistDelayS} />
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
                  <LikeButton track={track} className={`h-11 w-11 ${likeTone}`} />
              </div>

              <div className={`mt-4 ${ROW}`}>
                <SeekBar current={track} />
              </div>

            <div role="group" aria-label="Transport" className={`mt-4 flex items-center justify-between ${ROW}`}>
                <Control
                  label={REPEAT_LABEL[repeat]}
                  icon={Repeat}
                  size={48}
                  active={repeat !== "off"}
                  pressed={repeat !== "off"}
                  dot={repeat !== "off"}
                  toggleKind="repeat"
                  toggleState={repeat}
                  badge={repeat === "one" ? "1" : undefined}
                  onClick={() => {
                    haptic("tick");
                    cycleRepeat();
                  }}
                />
                <Control
                  label="Previous"
                  icon={SkipBack}
                  size={56}
                  glyph={24}
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
                  whileTap={empty ? undefined : pressTap(reduced)}
                  transition={phoneSnappy}
                  className={`grid h-16 w-16 shrink-0 place-items-center rounded-full ${playTone} ${FOCUS} disabled:opacity-[var(--disabled-opacity)]`}
                >
                  <PlayPauseGlyph playing={playing} buffering={buffering} />
                </motion.button>
                <Control
                  label="Next"
                  icon={SkipForward}
                  size={56}
                  glyph={24}
                  active
                  disabled={empty}
                  onClick={() => {
                    haptic("tick");
                    next(true);
                  }}
                />
                <Control
                  label={shuffle ? "Disable shuffle" : "Enable shuffle"}
                  icon={Shuffle}
                  size={48}
                  active={shuffle}
                  pressed={shuffle}
                  dot={shuffle}
                  toggleKind="shuffle"
                  toggleState={shuffle ? "on" : "off"}
                  onClick={() => {
                    haptic("tick");
                    toggleShuffle();
                  }}
                />
              </div>

              <div className={`mt-4 flex items-center justify-between pb-2 ${ROW}`}>
                <Control label="Cast" icon={Screencast} size={48} strong disabled={empty} onClick={() => setCastSheetOpen(true)} />
                <LyricsHint visible={hintVisible} onOpen={() => openPanelKind("lyrics")} />
                <Control label="Queue" icon={Queue} size={48} strong onClick={() => openPanelKind("queue")} />
              </div>

            </motion.div>
            <motion.div
              className={`absolute inset-x-0 bottom-0 ${PANEL_HEADER_TOP} z-20 flex flex-col will-change-[opacity] ${panel ? "" : "pointer-events-none"}`}
              style={{ opacity: overlayOpacity }}
            >
              <div {...artHandlers} className="flex h-[78px] shrink-0 touch-none items-center gap-3 px-6">
                <span data-queue-thumb aria-hidden="true" className="block h-[54px] w-[54px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-title text-card-title font-semibold leading-[22px] ${titleTone}`}>{track?.title ?? "Nothing playing"}</p>
                  <p className={`truncate text-body leading-[20px] ${artistTone}`}>{track?.artist ?? ""}</p>
                </div>
                {panelKind === "queue" && (
                  <span className={`shrink-0 ${titleTone}`}>
                    <PhoneIcon icon={SpeakerHigh} />
                  </span>
                )}
              </div>
              {panelKind === "lyrics" ? (
                <motion.div className="flex min-h-0 flex-1 flex-col px-6 will-change-transform" style={{ y: panelListY }} {...artHandlers}>
                  <PhoneLyrics />
                  <div className="shrink-0 pb-2 pt-1">
                    <SeekBar current={track} slim />
                    <div role="group" aria-label="Lyrics transport" className="flex h-12 items-center justify-center gap-8">
                      <Control label="Previous" icon={SkipBack} size={44} disabled={empty} onClick={() => prev()} />
                      <motion.button type="button" aria-label={playLabel} onClick={() => toggle()} whileTap={empty ? undefined : pressTap(reduced)} transition={phoneSnappy} className={`grid size-11 place-items-center rounded-full bg-ink-1 text-surface ${FOCUS}`}>
                        <PlayPauseGlyph playing={playing} buffering={buffering} />
                      </motion.button>
                      <Control label="Next" icon={SkipForward} size={44} disabled={empty} onClick={() => next(true)} />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 will-change-transform" style={{ y: panelListY }}>
                  {panelKind === "queue" && <PhoneQueueList />}
                </motion.div>
              )}
            </motion.div>
            <AnimatePresence>
              {castSheetOpen && (
                <Sheet label="Cast to a device" onClose={() => setCastSheetOpen(false)} height={isCasting() ? "360px" : "420px"} header={<div className="flex h-12 items-center text-section font-semibold">Cast to a device</div>}>
                  <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto px-4 pb-4">
                    <CastDeviceList onPick={() => setCastSheetOpen(false)} />
                    <p className="text-center text-meta text-ink-2">Keep your phone and Cast device on the same Wi-Fi network.</p>
                    <button type="button" className="mt-2 min-h-11 px-4 text-body font-medium text-ink-1" onClick={() => void castFromNowPlaying()}>Open device picker</button>
                    {isCasting() && (
                      <button
                        type="button"
                        className="min-h-11 px-4 text-body font-medium text-ink-1"
                        onClick={() => {
                          stopCastingFromApp();
                          setCastSheetOpen(false);
                        }}
                      >
                        Stop casting
                      </button>
                    )}
                  </div>
                </Sheet>
              )}
            </AnimatePresence>
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

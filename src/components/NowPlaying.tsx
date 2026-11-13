import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { normalizeCredit } from "../lib/credits";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, CastIcon,FavouriteIcon, MusicNote01Icon, Search01Icon, VolumeHighIcon, VolumeLowIcon, VolumeOffIcon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { CaptionButtons } from "./CaptionButtons";
import { Groove } from "./Groove";
import { PlaybackButtons, TransportButton } from "./PlaybackControls";
import { AddToPlaylist } from "./PlayerBar";
import { QueuePanel } from "./RightRail";
import { LyricsChoice } from "./LyricsChoice";
import { SyncedLyrics } from "./SyncedLyrics";
import { VinylRack } from "./VinylRack";
import { CENTRE_FRACTION as RACK_CENTRE_FRACTION, CENTRE_MAX as RACK_CENTRE_MAX } from "../lib/vinylRack";
import { UpNext } from "./UpNext";
import { upgradeArtwork } from "../lib/artwork";
import { platform, setFullScreen } from "../lib/bridge";
import { castFromNowPlaying } from "../lib/cast";
import { submitSearch } from "../lib/searchActions";
import { OnArtContext } from "../lib/onArt";
import { hasCaptionButtons } from "../lib/desktopPlatform";
import { canvasClipFor } from "../lib/canvas";
import { visibleLyricLines } from "../lib/lyricsLines";
import { useLyricsOffset, useLyricsTimingKeys } from "../lib/lyricsOffset";
import { reducedMotion } from "../lib/motion";
import { useArtworkPalette } from "../lib/artworkPalette";
import { setKeepAwake } from "../lib/wakeLock";
import { AmbientBackdrop, paletteCoverFor } from "./AmbientBackdrop";
import { useTrackLyrics } from "../lib/useTrackLyrics";
import { peekArtistMeta } from "../stores/artistMeta";
import { useLibrary } from "../stores/library";
import { currentTrack, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { topBarLeadingInset } from "../lib/windowChrome";

const IDLE_MS = 3000;
const ESC_HINT_MS = 3000;
const EXIT_MS = 210;
const ART_TARGET = 1200;
const MODES = [
  { id: "lyrics", label: "Lyrics" },
  { id: "queue", label: "Queue" },
] as const;
type Mode = (typeof MODES)[number]["id"];

async function changeFullscreen(enabled: boolean) {
  try {
    await setFullScreen(enabled);
  } catch {
    useUI.getState().toast("Couldn't change full screen", "error");
  }
}

function TopSearch() {
  const searchQuery = useUI((state) => state.searchQuery);
  const setSearchQuery = useUI((state) => state.setSearchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex w-[260px] max-w-full items-center">
      <span className="pointer-events-none absolute left-3 text-art/[0.72]">
        <Icon icon={Search01Icon} />
      </span>
      <input
        ref={inputRef}
        type="search"
        aria-label="Search"
        placeholder="Search"
        maxLength={200}
        spellCheck={false}
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submitSearch(searchQuery);
          useUI.getState().closeNowPlaying();
        }}
        className={`h-10 w-full rounded-[12px] [corner-shape:squircle] bg-art/[0.18] pl-10 text-[14px] text-art placeholder:text-art/[0.72] focus-visible:outline-none focus-visible:bg-art/[0.24] ${searchQuery ? "pr-11" : "pr-4"}`}
      />
      {searchQuery && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setSearchQuery("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[9px] [corner-shape:squircle] text-art/[0.72] motion-safe:transition-colors hover:bg-art/[0.12] hover:text-art focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Icon icon={Cancel01Icon} />
        </button>
      )}
    </div>
  );
}

function useIdleChrome(active: boolean): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    setIdle(false);
    if (!active) return;
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      window.clearTimeout(timer);
      setIdle(false);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
    };
  }, [active]);

  return idle;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const VOLUME_KEY_STEP: Record<string, number> = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 };

export function NowPlaying() {
  const open = useUI((state) => state.nowPlayingOpen);
  const keepAwake = useSettings((state) => state.keepScreenAwake);
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const wasOpen = useRef(false);
  const enteredFullscreen = useRef(false);
  const exitTimer = useRef(0);
  const hintTimer = useRef(0);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      window.clearTimeout(exitTimer.current);
      window.clearTimeout(hintTimer.current);
      setMounted(true);
      setExiting(false);
      setHintVisible(true);
      hintTimer.current = window.setTimeout(() => setHintVisible(false), ESC_HINT_MS);
      enteredFullscreen.current = !useUI.getState().osFullscreen;
      void changeFullscreen(true);
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    window.clearTimeout(hintTimer.current);
    setHintVisible(false);
    if (enteredFullscreen.current) {
      enteredFullscreen.current = false;
      void changeFullscreen(false);
    }
    if (reducedMotion()) {
      setMounted(false);
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, EXIT_MS);
  }, [open]);

  useEffect(
    () => () => {
      window.clearTimeout(exitTimer.current);
      window.clearTimeout(hintTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!keepAwake) {
      void setKeepAwake(false);
      return;
    }
    if (!open) return;
    void setKeepAwake(true);
    const release = () => void setKeepAwake(false);
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      void setKeepAwake(false);
    };
  }, [open, keepAwake]);

  if (!mounted) return null;
  return <NowPlayingView exiting={exiting} hintVisible={hintVisible} />;
}

function MarqueeTitle({ text }: { text: string }) {
  const [shift, setShift] = useState(0);
  const boxRef = useRef<HTMLHeadingElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const start = () => {
    if (reducedMotion()) return;
    const over = (labelRef.current?.scrollWidth ?? 0) - (boxRef.current?.clientWidth ?? 0);
    if (over > 0) setShift(over);
  };
  const stop = () => setShift(0);
  return (
    <h2
      ref={boxRef}
      tabIndex={0}
      title={text}
      onPointerEnter={start}
      onPointerLeave={stop}
      onFocus={start}
      onBlur={stop}
      className="animate-fade-in min-w-0 overflow-hidden whitespace-nowrap rounded-md text-[28px] font-semibold tracking-[-0.02em] text-art focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus [font-family:var(--font-lyric)] font-synthesis-none"
    >
      <span
        ref={labelRef}
        className={shift > 0 ? "block whitespace-nowrap" : "block truncate"}
        style={{
          transform: `translateX(-${shift}px)`,
          transition: shift > 0 ? `transform ${Math.max(4, shift / 30)}s linear` : "transform var(--dur-quick) var(--ease-out)",
        }}
      >
        {text}
      </span>
    </h2>
  );
}

function NowPlayingView({ exiting, hintVisible }: { exiting: boolean; hintVisible: boolean }) {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const position = usePlayer((state) => state.position);
  const seek = usePlayer((state) => state.seek);
  const playing = usePlayer((state) => state.playing);
  const lyricsCenter = useUI((state) => state.lyricsCenter);
  const toggleNowPlaying = useUI((state) => state.toggleNowPlaying);
  const menuOpen = useUI((state) => Boolean(state.contextMenu || state.dialog || state.playlistPicker));
  const animatedCanvas = useSettings((state) => state.animatedCanvas);
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const volume = usePlayer((state) => state.volume);
  const muted = usePlayer((state) => state.muted);
  const setVolume = usePlayer((state) => state.setVolume);
  const toggleMute = usePlayer((state) => state.toggleMute);
  const level = muted ? 0 : volume;
  const silent = muted || volume === 0;
  const toggleLike = useLibrary((state) => state.toggleLike);
  const [mode, setMode] = useState<Mode>("lyrics");
  const trackId = track?.id ?? null;
  const offset = useLyricsOffset(trackId);
  const { lyrics, loading, reload } = useTrackLyrics(track, duration);
  const synced = lyrics?.synced ?? null;
  const lines = useMemo(() => (synced ? visibleLyricLines(synced) : []), [synced]);
  const hasLyrics = Boolean(synced?.length || lyrics?.plain?.trim());
  useLyricsTimingKeys(trackId, !lyricsCenter);
  const idle = useIdleChrome(playing && !menuOpen && !exiting);

  const artwork = upgradeArtwork(track?.thumb, ART_TARGET);
  const cover = artwork || upgradeArtwork(peekArtistMeta(track?.artist ?? "")?.thumb, ART_TARGET);
  const paletteSrc = paletteCoverFor(track);
  const ambient = useArtworkPalette(paletteSrc);
  const clip = trackId ? canvasClipFor(trackId) : null;
  const showClip = animatedCanvas && clip !== null && !reducedMotion();

  const chrome = idle
    ? "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100"
    : "opacity-100";
  const chromeMotion = "motion-safe:transition-opacity motion-safe:duration-fade";

  return (
    <OnArtContext.Provider value>
    <section
      aria-label="Now Playing"
      data-idle={idle}
      className={`fixed inset-0 z-[100] flex flex-col overflow-hidden ${exiting ? "opacity-0 motion-safe:transition-opacity motion-safe:duration-fade" : "animate-fade-in"} ${idle ? "cursor-none" : ""}`}
    >
      <AmbientBackdrop primary={ambient.primary} src={paletteSrc} className="absolute inset-0" />
      <p
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 motion-safe:transition-[opacity,transform] motion-safe:duration-swap ${hintVisible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
      >
        <span className="flex items-center gap-3 rounded-lg border border-separator bg-panel px-4 py-3 text-[14.5px] text-ink-1">
          To exit full screen, press
          <kbd className="grid h-7 min-w-[36px] place-items-center rounded-[5px] border border-ink-2 px-2 text-[13px] text-ink-1">
            Esc
          </kbd>
        </span>
      </p>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <header
          data-tauri-drag-region
          style={{ paddingLeft: topBarLeadingInset(platform) }}
          className={`relative z-10 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] pl-3 pr-4 ${chrome} ${chromeMotion}`}
        >
          <div data-tauri-drag-region className="flex items-center justify-start">
            <button
              type="button"
              title="Close (Esc)"
              aria-label="Close Now Playing"
              onClick={toggleNowPlaying}
              className="-ml-1 grid h-10 w-10 place-items-center rounded-[12px] [corner-shape:squircle] text-art/[0.55] hover:bg-art/[0.12] hover:text-art motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon icon={ArrowDown01Icon} />
            </button>
          </div>
          <div data-tauri-drag-region className="flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div role="group" aria-label="Now Playing panel" className="flex gap-1 rounded-[12px] [corner-shape:squircle] bg-art/[0.18] p-1">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={mode === item.id}
                    onClick={() => setMode(item.id)}
                    className={`hit-area h-8 w-24 rounded-[8px] [corner-shape:squircle] text-center text-[13px] font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${mode === item.id ? "bg-art text-base" : "text-art/[0.72] hover:bg-art/[0.12] hover:text-art"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="hidden min-[1024px]:block">
                <TopSearch />
              </div>
            </div>
          </div>
          <div data-tauri-drag-region className="flex h-full items-stretch justify-end pl-3">
            {hasCaptionButtons(platform) && <CaptionButtons variant="compact" />}
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-8 px-8 pb-4 lg:flex-row lg:justify-center lg:gap-12 lg:px-14 xl:gap-20">
          <div className="flex min-h-0 min-w-0 flex-col items-center justify-center lg:w-[clamp(420px,34vw,640px)] lg:flex-none">
            {track ? (
              <div className="flex w-full max-w-full flex-col">
                <VinylRack cover={cover} overlay={showClip && clip ? <CoverClip key={clip.url} url={clip.url} playing={playing} /> : null} />
                <div className="mx-auto flex w-full min-w-0 flex-col" style={{ width: `min(${RACK_CENTRE_MAX}px, ${RACK_CENTRE_FRACTION * 100}%)` }}>
                  <div className="mt-6 min-w-0 text-center">
                    <MarqueeTitle key={`title-${track.id}`} text={track.title} />
                    <p key={`artist-${track.id}`} className="animate-fade-in mt-1 truncate text-[16px] text-art/[0.72]">{normalizeCredit(track.artist)}</p>
                  </div>
                  <div className={`mt-5 w-full ${chrome} ${chromeMotion}`}>
                    <Groove seed={track.id} position={position} duration={duration} onSeek={seek} lyrics={lines} playing={playing} onArt />
                  </div>
                  <div role="group" aria-label="Transport" className={`mt-4 flex w-full items-center justify-between ${chrome} ${chromeMotion}`}>
                    <div className="-ml-[10px] flex shrink-0 items-center">
                      <TransportButton
                        label={liked ? "Remove from Library" : "Add to Library"}
                        icon={FavouriteIcon}
                        active={liked}
                        dot={false}
                        filled={liked}
                        pressed={liked}
                        onArt
                        onClick={() => toggleLike(track)}
                      />
                      {platform === "android" && (
                        <TransportButton label="Cast" icon={CastIcon} onArt onClick={() => void castFromNowPlaying()} />
                      )}
                    </div>
                    <PlaybackButtons onArt />
                    <div className="-mr-[10px] shrink-0">
                      <AddToPlaylist track={track} onArt />
                    </div>
                  </div>
                  <div role="group" aria-label="Volume" className={`mt-4 flex w-full items-center gap-0.5 ${chrome} ${chromeMotion}`}>
                    <button
                      type="button"
                      aria-label={muted ? "Unmute" : "Mute"}
                      onClick={toggleMute}
                      className={`hit-area -ml-[10px] grid h-10 w-10 shrink-0 place-items-center rounded-full text-art/[0.72] hover:text-art ${FOCUS_RING}`}
                    >
                      <HugeiconsIcon icon={silent ? VolumeOffIcon : VolumeLowIcon} size={20} strokeWidth={1.5} />
                    </button>
                    <input
                      type="range"
                      aria-label="Volume"
                      min={0}
                      max={1}
                      step={0.01}
                      value={level}
                      onChange={(event) => setVolume(Number(event.target.value))}
                      onKeyDown={(event) => {
                        const delta = VOLUME_KEY_STEP[event.key];
                        if (delta === undefined) return;
                        event.preventDefault();
                        setVolume(Math.round(Math.min(1, Math.max(0, level + delta)) * 100) / 100);
                      }}
                      style={{ "--level": `${level * 100}%` } as CSSProperties}
                      className={`volume-art h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-art [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-art ${FOCUS_RING}`}
                    />
                    <button
                      type="button"
                      aria-label="Full volume"
                      onClick={() => setVolume(1)}
                      className={`hit-area -mr-[10px] grid h-10 w-10 shrink-0 place-items-center rounded-full text-art/[0.72] hover:text-art ${FOCUS_RING}`}
                    >
                      <HugeiconsIcon icon={VolumeHighIcon} size={20} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-[10px] border border-art/[0.18] text-art/[0.55]">
                  <Icon icon={MusicNote01Icon} />
                </div>
                <p className="text-sm text-art">Nothing playing yet</p>
                <p className="mt-1 text-[13px] text-art/[0.55]">Play something and it will show up here.</p>
              </div>
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-6 pr-16 lg:max-w-[720px]">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {mode === "queue" ? (
                <QueuePanel />
              ) : track && (loading || hasLyrics) ? (
                <SyncedLyrics key={track.id} lyrics={lyrics} loading={loading} offset={offset} trackKey={track.id} onArt />
              ) : (
                track && (
                  <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden pt-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-[13px] text-art/[0.55]">No lyrics for this song</p>
                      <LyricsChoice track={track} duration={duration} overridden={false} onChanged={reload} />
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <UpNext />
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
    </OnArtContext.Provider>
  );
}

function CoverClip({ url, playing }: { url: string; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [playing, url]);

  return <video ref={ref} src={url} muted playsInline loop className="absolute inset-0 h-full w-full object-cover" />;
}

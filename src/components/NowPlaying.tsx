import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown01Icon, FavouriteIcon, MusicNote01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./RightRail";
import { SyncedLyrics } from "./SyncedLyrics";
import { upgradeArtwork } from "../lib/artwork";
import { setFullScreen } from "../lib/bridge";
import { canvasClipFor } from "../lib/canvas";
import { useLyricsOffset, useLyricsTimingKeys } from "../lib/lyricsOffset";
import { reducedMotion } from "../lib/motion";
import { useArtTint } from "../lib/palette";
import { useTrackLyrics } from "../lib/useTrackLyrics";
import { peekArtistMeta } from "../stores/artistMeta";
import { useLibrary } from "../stores/library";
import { currentTrack, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

const IDLE_MS = 3000;
const ESC_HINT_MS = 3000;
const EXIT_MS = 210;
const VIZ_BARS = 32;
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

function vizBar(index: number): CSSProperties {
  const r1 = ((index * 137) % 101) / 101;
  return {
    "--rest": (0.12 + r1 * 0.1).toFixed(2),
  } as CSSProperties;
}

export function NowPlaying() {
  const open = useUI((state) => state.nowPlayingOpen);
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

  if (!mounted) return null;
  return <NowPlayingView exiting={exiting} hintVisible={hintVisible} />;
}

function NowPlayingView({ exiting, hintVisible }: { exiting: boolean; hintVisible: boolean }) {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const playing = usePlayer((state) => state.playing);
  const lyricsCenter = useUI((state) => state.lyricsCenter);
  const toggleNowPlaying = useUI((state) => state.toggleNowPlaying);
  const menuOpen = useUI((state) => Boolean(state.contextMenu || state.dialog || state.playlistPicker));
  const fullBleed = useSettings((state) => state.fullBleedArtwork);
  const animatedCanvas = useSettings((state) => state.animatedCanvas);
  const liked = useLibrary((state) => track !== null && state.liked.some((item) => item.id === track.id));
  const toggleLike = useLibrary((state) => state.toggleLike);
  const [mode, setMode] = useState<Mode>("lyrics");
  const trackId = track?.id ?? null;
  const offset = useLyricsOffset(trackId);
  const { lyrics, loading } = useTrackLyrics(track, duration);
  useLyricsTimingKeys(trackId, !lyricsCenter);
  const idle = useIdleChrome(playing && !menuOpen && !exiting);

  const artwork = upgradeArtwork(track?.thumb, ART_TARGET);
  const cover = artwork || upgradeArtwork(peekArtistMeta(track?.artist ?? "")?.thumb, ART_TARGET);
  const tint = useArtTint(cover);
  const clip = trackId ? canvasClipFor(trackId) : null;
  const showClip = animatedCanvas && clip !== null && !reducedMotion();

  const chrome = idle
    ? "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100"
    : "opacity-100";
  const chromeMotion = "motion-safe:transition-opacity motion-safe:duration-fade";

  return (
    <section
      aria-label="Now Playing"
      data-idle={idle}
      className={`fixed inset-0 z-[100] flex flex-col overflow-hidden bg-surface ${exiting ? "opacity-0 motion-safe:transition-opacity motion-safe:duration-fade" : "animate-fade-in"} ${idle ? "cursor-none" : ""}`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 bottom-0 ${fullBleed ? "top-0" : "top-14"}`}
        style={{ background: `linear-gradient(rgb(${tint} / 0.06), rgb(${tint} / 0.06)), rgb(var(--surface))` }}
      />
      <p
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 motion-safe:transition-[opacity,transform] motion-safe:duration-swap ${hintVisible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"}`}
      >
        <span className="flex items-center gap-3 rounded-lg border border-separator bg-panel px-4 py-3 text-[14.5px] text-ink-1">
          To exit full screen, press
          <kbd className="grid h-7 min-w-[36px] place-items-center rounded-[5px] border border-ink-2 px-2 text-[13px] text-ink-1">
            Esc
          </kbd>
        </span>
      </p>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className={`relative z-10 flex h-14 shrink-0 items-center px-3 ${chrome} ${chromeMotion}`}>
          <button
            type="button"
            title="Close (Esc)"
            aria-label="Close Now Playing"
            onClick={toggleNowPlaying}
            className="-ml-1 grid h-10 w-10 place-items-center rounded-full text-ink-2 hover:bg-wash hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Icon icon={ArrowDown01Icon} />
          </button>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-8 px-8 pb-4 lg:flex-row lg:justify-center lg:gap-12 lg:px-14 xl:gap-20">
          <div className="flex min-h-0 min-w-0 flex-col items-center justify-center lg:w-[44%] lg:flex-none xl:w-[42%]">
            {track ? (
              <>
                <div className="relative aspect-square w-[min(42vh,460px)] max-w-full overflow-hidden rounded-[10px] bg-wash outline outline-1 -outline-offset-1 outline-white/10">
                  {cover ? (
                    <img key={cover} src={cover} alt="" className="animate-fade-in h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-ink-2">
                      <Icon icon={MusicNote01Icon} />
                    </div>
                  )}
                  {showClip && clip && <CoverClip key={clip.url} url={clip.url} playing={playing} />}
                </div>
                <h2 key={track.id} className="animate-fade-in mt-7 max-w-full truncate text-[26px] font-bold tracking-[-0.03em] text-ink-1 xl:text-[30px]">
                  {track.title}
                </h2>
                <p key={track.id} className="animate-fade-in mt-1.5 max-w-full truncate text-[14px] text-ink-2 xl:text-[15px]">{track.artist}</p>
                <div className={`mt-4 ${chrome} ${chromeMotion}`}>
                  <button
                    type="button"
                    aria-pressed={liked}
                    onClick={() => toggleLike(track)}
                    className={`inline-flex h-10 items-center gap-2 rounded-full bg-wash px-4 text-[12.5px] font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${liked ? "text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
                  >
                    <Icon icon={FavouriteIcon} />
                    {liked ? "In Your Library" : "Add to Library"}
                  </button>
                </div>
                <div
                  aria-hidden="true"
                  className={`fs-viz mt-7 flex h-9 w-[min(300px,72%)] items-center justify-center gap-[5px] ${playing ? "is-playing" : ""}`}
                >
                  {Array.from({ length: VIZ_BARS }, (_, index) => (
                    <span key={index} className="fs-viz-bar" style={vizBar(index)} />
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center text-center">
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-[10px] border border-separator bg-panel text-ink-2">
                  <Icon icon={MusicNote01Icon} />
                </div>
                <p className="text-sm text-ink-1">Nothing playing yet</p>
                <p className="mt-1 text-[13px] text-ink-2">Play something and it will show up here.</p>
              </div>
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:max-w-[780px]">
            <div className={`mb-5 flex h-10 shrink-0 justify-center lg:justify-start ${chrome} ${chromeMotion}`}>
              <div role="group" aria-label="Now Playing panel" className="flex gap-1 rounded-full bg-wash p-1">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={mode === item.id}
                    onClick={() => setMode(item.id)}
                    className={`h-8 rounded-full px-4 text-[13px] font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${mode === item.id ? "bg-elevated text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {mode === "queue" ? (
                <QueuePanel />
              ) : (
                track && (
                  <SyncedLyrics key={track.id} lyrics={lyrics} loading={loading} offset={offset} trackKey={track.id} />
                )
              )}
            </div>
          </div>
        </div>

        <div className={`relative z-10 shrink-0 ${chrome} ${chromeMotion}`}>
          <PlayerBar />
        </div>
      </div>
    </section>
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

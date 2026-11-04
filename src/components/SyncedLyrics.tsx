import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject } from "react";
import { getPlaybackPosition } from "../lib/audio";
import type { LyricsResult, SyncedLyricLine, SyncedLyricWord } from "../lib/bridge";
import {
  activeLineIndex,
  depthStyle,
  isSectionLabel,
  resolveWordSpans,
  SEEK_LEAD_IN_S,
  sweepWindow,
  visibleLyricLines,
  wordPercent,
  type WordSpan,
} from "../lib/lyricsLines";
import { LYRICS_LOADING_LINES, pickLyricsLine } from "../lib/lyricsPhrases";
import { reducedMotion } from "../lib/motion";
import { romanize } from "../lib/romanize";
import { usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";

const ANCHOR = 0.5;
const GLIDE_MS = 600;
const LOADING_DELAY_MS = 300;
const GLIDE_CANCEL_SCREENS = 1.5;
const DEPTH_TRANSITION = "opacity var(--dur-quick) var(--ease-out)";
const EDGE_MASK = "linear-gradient(to right, transparent 0%, black 24px, black calc(100% - 24px), transparent 100%)";
const FADE_MASK = "linear-gradient(to bottom, transparent 0%, black 14%, black 86%, transparent 100%)";
const GLOW = "drop-shadow(0 0 22px rgb(var(--ink-1) / 0.28))";
const FOCUS_RING = "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const LINE_CLASS = "font-display text-[40px] leading-[1.25] tracking-[-0.03em] font-extrabold";
const SUB_CLASS = "font-display text-[22px] leading-[1.3] font-bold";

type Glide = { frame: number; from: number; to: number; start: number };
type GlideRef = MutableRefObject<Glide | null>;
type Words = NonNullable<SyncedLyricLine["words"]>;

type SyncedLyricsProps = {
  lyrics: LyricsResult | null;
  loading: boolean;
  offset?: number;
  trackKey?: string;
};

function stopGlide(glideRef: GlideRef) {
  const glide = glideRef.current;
  if (glide) cancelAnimationFrame(glide.frame);
  glideRef.current = null;
}

function stepGlide(glideRef: GlideRef, scroller: HTMLElement) {
  const glide = glideRef.current;
  if (!glide) return;
  const frame = (now: number) => {
    const current = glideRef.current;
    if (!current) return;
    const t = Math.min(1, (now - current.start) / GLIDE_MS);
    scroller.scrollTop = current.from + (current.to - current.from) * (1 - (1 - t) ** 4);
    if (t >= 1) {
      glideRef.current = null;
      return;
    }
    current.frame = requestAnimationFrame(frame);
  };
  glide.frame = requestAnimationFrame(frame);
}

function scrollTargetFor(scroller: HTMLElement, line: HTMLElement): number {
  const lineBox = line.getBoundingClientRect();
  const scrollerBox = scroller.getBoundingClientRect();
  const middle = scroller.scrollTop + lineBox.top - scrollerBox.top + lineBox.height / 2;
  return Math.max(0, middle - scroller.clientHeight * ANCHOR);
}

function LoadingLine({ phrase }: { phrase: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="flex justify-center py-12">
      {visible && (
        <p
          className={`font-display text-[28px] font-extrabold tracking-[-0.02em] text-ink-1/55`}
        >
          {phrase}
        </p>
      )}
    </div>
  );
}

function WordLine({
  words,
  spans,
  offset,
  glowStyle,
  still,
}: {
  words: Words;
  spans: WordSpan[];
  offset: number;
  glowStyle?: CSSProperties;
  still: boolean;
}) {
  const playing = usePlayer((state) => state.playing);
  const [, redraw] = useReducer((count: number) => (count + 1) % 1000000, 0);
  const position = useRef(0);

  useEffect(() => {
    position.current = getPlaybackPosition() - offset;
    redraw();
    if (!playing || still) return;
    let frame = 0;
    const tick = () => {
      position.current = getPlaybackPosition() - offset;
      redraw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, offset, still]);

  return (
    <span className={LINE_CLASS} style={glowStyle}>
      {words.map((word: SyncedLyricWord, index) => {
        const percent = wordPercent(position.current, spans[index] ?? { start: word.start, end: word.end });
        return (
          <span key={index}>
            {index > 0 ? " " : ""}
            <span
              style={{
                backgroundImage: `linear-gradient(90deg, rgb(var(--ink-1)) ${percent}%, rgb(var(--ink-1) / 0.28) ${percent}%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {word.text}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function GapDots({ opacity }: { opacity: number }) {
  return (
    <div
      role="img"
      aria-label="Instrumental"
      title="Instrumental"
      className="flex items-center gap-1.5 py-1"
      style={{ opacity: Math.max(0.15, opacity) }}
    >
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="h-1.5 w-1.5 rounded-full bg-ink-1/80" style={{ boxShadow: "0 0 12px rgba(255,255,255,0.5)" }} />
      ))}
    </div>
  );
}

function SourceCredit({ source }: { source: string }) {
  if (!source) return null;
  return <p className="pt-4 text-[12px] font-medium text-ink-2">Lyrics from {source}</p>;
}

function EmptyText() {
  return <p className="py-16 text-center text-base text-ink-2">No lyrics available for this track.</p>;
}

export function SyncedLyrics({ lyrics, loading, offset = 0, trackKey }: SyncedLyricsProps) {
  const position = usePlayer((state) => state.position);
  const seek = usePlayer((state) => state.seek);
  const syncedOn = useSettings((state) => state.syncedLyrics);
  const blurOn = useSettings((state) => state.blurUnfocusedLyrics);
  const romanOn = useSettings((state) => state.romanizeLyrics);
  const reduceAnimation = useSettings((state) => state.reduceAnimation);
  const reduceBlur = useSettings((state) => state.reduceDynamicBlur);
  const blurLines = blurOn && !reduceBlur;
  const glowLines = blurOn && !reduceAnimation && !reduceBlur;
  const still = reduceAnimation || reducedMotion();
  const source = lyrics?.source ?? "";
  const phrase = useMemo(() => pickLyricsLine(LYRICS_LOADING_LINES, trackKey ?? source), [trackKey, source]);

  const synced = lyrics?.synced ?? null;
  const lines = useMemo(() => {
    const visible = synced ? visibleLyricLines(synced) : [];
    return visible.length > 0 ? visible : null;
  }, [synced]);

  const staticText = useMemo(() => {
    if (lyrics?.plain?.trim()) return lyrics.plain;
    const joined = (synced ?? [])
      .map((line) => line.text.trim())
      .filter((text) => text !== "")
      .join("\n");
    return joined === "" ? null : joined;
  }, [lyrics, synced]);

  const activeIndex = lines ? activeLineIndex(lines, position - offset) : -1;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const glideRef: GlideRef = useRef<Glide | null>(null);
  const lastActive = useRef(-1);

  useEffect(() => () => stopGlide(glideRef), []);

  useEffect(() => {
    if (activeIndex < 0) return;
    const moved = lastActive.current !== activeIndex;
    lastActive.current = activeIndex;
    const frame = requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      const line = activeRef.current;
      if (!scroller || !line) return;
      const target = scrollTargetFor(scroller, line);
      if (!moved) {
        if (glideRef.current) glideRef.current.to = target;
        else scroller.scrollTop = target;
        return;
      }
      stopGlide(glideRef);
      const from = scroller.scrollTop;
      if (still || Math.abs(target - from) > scroller.clientHeight * GLIDE_CANCEL_SCREENS) {
        scroller.scrollTop = target;
        return;
      }
      glideRef.current = { frame: 0, from, to: target, start: performance.now() };
      stepGlide(glideRef, scroller);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, lines, still]);

  if (loading) return <LoadingLine phrase={phrase} />;

  if (!staticText) return <EmptyText />;

  if (!syncedOn || !lines) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar">
        <pre className="whitespace-pre-wrap py-2 font-sans text-[15px] leading-7 text-ink-2">{staticText}</pre>
        <SourceCredit source={source} />
      </div>
    );
  }

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-line]"));
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    buttons[Math.min(buttons.length - 1, Math.max(0, index + step))].focus();
  };

  const renderLine = (line: SyncedLyricLine, index: number) => {
    const depth = depthStyle(index - activeIndex, index < activeIndex, blurLines);
    const motionStyle = still ? { transition: "none" } : { transition: DEPTH_TRANSITION };
    if (line.gap) {
      return (
        <div key={index} style={{ ...motionStyle, opacity: depth.opacity }}>
          <GapDots opacity={depth.opacity} />
        </div>
      );
    }
    if (isSectionLabel(line.text)) {
      return (
        <h3 key={index} className="pt-2 text-[15px] font-semibold text-ink-2">
          {line.text.trim().slice(1, -1)}
        </h3>
      );
    }

    const active = index === activeIndex;
    const glowStyle: CSSProperties | undefined = active && glowLines ? { filter: GLOW } : undefined;
    const roman = romanOn ? (line.roman ?? romanize(line.text)) : null;
    const words = line.words ?? [];
    const wordSynced = active && words.length > 0;
    const [spanStart, spanEnd] = wordSynced ? sweepWindow(lines, index) : [0, 0];

    return (
      <button
        key={index}
        ref={active ? activeRef : undefined}
        type="button"
        data-line
        title="Jump here"
        onClick={() => seek(Math.max(0, line.time + offset - SEEK_LEAD_IN_S))}
        className={`block w-full origin-left text-left text-ink-1 ${FOCUS_RING}`}
        style={{
          ...motionStyle,
          opacity: depth.opacity,
          filter: depth.filter,
          transform: depth.transform,
          transformOrigin: "left center",
        }}
      >
        {wordSynced ? (
          <WordLine
            words={words}
            spans={resolveWordSpans(words, spanStart, spanEnd)}
            offset={offset}
            glowStyle={glowStyle}
            still={still}
          />
        ) : (
          <span className={LINE_CLASS} style={glowStyle}>
            {line.text}
          </span>
        )}
        {line.bg && <span className={`mt-1 block opacity-70 ${SUB_CLASS}`}>{line.bg.text}</span>}
        {roman && <span className={`mt-1 block text-ink-2 ${SUB_CLASS}`}>{roman}</span>}
      </button>
    );
  };

  return (
    <div className="relative -mx-6 flex min-h-0 flex-1" style={{ maskImage: EDGE_MASK, WebkitMaskImage: EDGE_MASK }}>
      <div
        ref={scrollerRef}
        className="no-scrollbar absolute inset-0 overflow-y-auto px-6"
        style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
        onWheel={() => stopGlide(glideRef)}
        onPointerDown={() => stopGlide(glideRef)}
      >
        <div style={{ height: "calc(10% + 4px)" }} />
        <div className="flex flex-col space-y-5" onKeyDown={moveFocus}>
          {lines.map(renderLine)}
        </div>
        <SourceCredit source={source} />
        <div style={{ height: `max(12px, calc(${ANCHOR * 100}% - 28px))` }} />
      </div>
    </div>
  );
}

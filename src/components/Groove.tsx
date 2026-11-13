import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtTime } from "../lib/format";
import {
  GROOVE_BACK_LAYER_ALPHA,
  GROOVE_HIT_MIN_PX,
  GROOVE_PLAIN_SIZE,
  GROOVE_SIZES,
  GROOVE_WAVE_FRAME_MS,
  GROOVE_WAVE_MAX_DT_S,
  clamp01,
  grooveBoxHeight,
  grooveSeed,
  grooveValueText,
  hillOffset,
  lyricAt,
  ratioAt,
  rubberBandOffset,
  seekTarget,
  stepWaveLevel,
  type GrooveProfile,
  type GrooveSize,
  type LyricPoint,
} from "../lib/groove";
import { reducedMotion } from "../lib/motion";

export type GrooveVariant = "plain" | "hills";

type GrooveProps = {
  seed: string;
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  lyrics?: readonly LyricPoint[];
  compact?: boolean;
  playing?: boolean;
  profile?: GrooveProfile;
  variant?: GrooveVariant;
  label?: string;
  className?: string;
  onArt?: boolean;
};

type Drag = { id: number; left: number; width: number; raw: number };

type Paint = {
  width: number;
  progress: number;
  seed: number;
  size: GrooveSize;
  fill: string;
  track: string;
};

const HILL_STEP_PX = 2;

function readRaw(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function inkIsDark(): boolean {
  return Number.parseInt(readRaw("--ink-1").split(" ")[0] ?? "0", 10) > 128;
}

function capsulePath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const r = Math.min(height / 2, width / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function paintGroove(canvas: HTMLCanvasElement | null, paint: Paint | null, clock: number, level: number) {
  if (!canvas || !paint || paint.width <= 0) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const { bar } = paint.size;
  const height = grooveBoxHeight(paint.size);
  const barTop = (height - bar) / 2;
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(paint.width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, paint.width, height);

  context.globalAlpha = 1;
  context.fillStyle = paint.track;
  capsulePath(context, 0, barTop, paint.width, bar);
  context.fill();

  const progressX = paint.width * paint.progress;
  if (progressX < paint.size.bar) return;

  context.save();
  context.beginPath();
  context.rect(0, 0, progressX, height);
  context.clip();
  context.fillStyle = paint.fill;
  capsulePath(context, 0, barTop, progressX, bar);
  context.fill();
  for (const layer of [0, 1] as const) {
    context.globalAlpha = layer === 0 ? GROOVE_BACK_LAYER_ALPHA : 1;
    context.beginPath();
    context.moveTo(0, barTop);
    for (let x = 0; x <= progressX; x += HILL_STEP_PX) {
      context.lineTo(x, barTop - hillOffset(x, progressX, clock, paint.seed, layer, paint.size, level));
    }
    context.lineTo(progressX, barTop);
    context.closePath();
    context.fill();
  }
  context.restore();
}

function GrooveTip({ time, line, left, above = false }: { time: number; line: string | null; left: number; above?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ left: `${left}%` }}
      className={`pointer-events-none absolute ${above ? "bottom-full mb-1" : "bottom-0"} flex h-5 max-w-[260px] -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-control bg-elevated px-1.5 text-[11px] leading-none text-ink-1 shadow-float`}
    >
      <span className="tabular-nums text-ink-2">{fmtTime(time)}</span>
      {line && <span className="truncate">{line}</span>}
    </span>
  );
}

export function Groove({
  seed,
  position,
  duration,
  onSeek,
  lyrics = [],
  compact = false,
  playing = false,
  profile = "stage",
  variant = "hills",
  label = "Seek",
  className = "",
  onArt = false,
}: GrooveProps) {
  const plain = variant === "plain";
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef<Paint | null>(null);
  const levelRef = useRef(0);
  const clockRef = useRef(0);
  const drag = useRef<Drag | null>(null);
  const [width, setWidth] = useState(0);
  const [palette, setPalette] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  const [hover, setHover] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const disabled = !(duration > 0);
  const max = disabled ? 0 : duration;
  const reduced = reducedMotion();
  const seedNumber = useMemo(() => grooveSeed(seed), [seed]);
  const size = plain ? GROOVE_PLAIN_SIZE : GROOVE_SIZES[profile];
  const boxHeight = grooveBoxHeight(size);
  const hitPad = Math.max(0, (GROOVE_HIT_MIN_PX - boxHeight) / 2);
  const fillColour = onArt ? `rgb(${readRaw("--on-art")})` : `rgb(${readRaw("--accent")})`;

  useEffect(() => {
    const node = layerRef.current;
    if (!node || plain) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [plain]);

  useEffect(() => {
    if (plain) return;
    const observer = new MutationObserver(() => setPalette((count) => count + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => observer.disconnect();
  }, [plain]);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const shown = preview === null ? Math.min(position, max) : preview * max;
  const progress = max > 0 ? clamp01(shown / max) : 0;
  const hoverTime = hover === null ? 0 : hover * max;
  const hoverLine = compact || hover === null ? null : lyricAt(lyrics, hoverTime);

  const paintNow = useCallback(() => paintGroove(canvasRef.current, paintRef.current, clockRef.current, levelRef.current), []);

  useEffect(() => {
    if (plain) return;
    paintRef.current = {
      width,
      progress,
      seed: seedNumber,
      size,
      fill: fillColour,
      track: onArt ? `rgb(${readRaw("--on-art")} / ${Number.parseFloat(readRaw("--on-art-track")) || 0.22})` : `rgb(${readRaw("--ink-1")} / ${inkIsDark() ? 0.18 : 0.12})`,
    };
    paintNow();
  }, [plain, width, progress, seedNumber, size, fillColour, palette, paintNow, onArt]);

  useEffect(() => {
    if (plain) return;
    if (reduced || !visible) {
      levelRef.current = 0;
      paintNow();
      return;
    }
    const target = playing ? 1 : 0;
    if (target === 0 && levelRef.current === 0) {
      paintNow();
      return;
    }
    let frame = 0;
    let previous: number | null = null;
    let lastPaint = Number.NEGATIVE_INFINITY;
    const tick = (now: number) => {
      const dt = previous === null ? 0 : Math.min(GROOVE_WAVE_MAX_DT_S, (now - previous) / 1000);
      previous = now;
      levelRef.current = stepWaveLevel(levelRef.current, target, dt);
      clockRef.current += dt * levelRef.current;
      const settled = target === 0 && levelRef.current === 0;
      if (settled || now - lastPaint >= GROOVE_WAVE_FRAME_MS) {
        lastPaint = now;
        paintNow();
      }
      if (!settled) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [plain, playing, reduced, visible, paintNow]);

  const pointerRatio = (clientX: number, rect: { left: number; width: number }) => ratioAt(clientX - rect.left, rect.width);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { id: event.pointerId, left: rect.left, width: rect.width, raw: event.clientX - rect.left };
    if (layerRef.current) layerRef.current.style.transition = "none";
    setPreview(pointerRatio(event.clientX, rect));
    setHover(pointerRatio(event.clientX, rect));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const current = drag.current;
    if (!current || current.id !== event.pointerId) {
      setHover(pointerRatio(event.clientX, event.currentTarget.getBoundingClientRect()));
      return;
    }
    current.raw = event.clientX - current.left;
    setPreview(ratioAt(current.raw, current.width));
    setHover(ratioAt(current.raw, current.width));
    if (layerRef.current) {
      const overshoot = current.raw < 0 ? current.raw : Math.max(0, current.raw - current.width);
      layerRef.current.style.transform = overshoot === 0 || reduced ? "" : `translateX(${rubberBandOffset(overshoot, current.width)}px)`;
    }
  };

  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (commit && max > 0) onSeek(ratioAt(event.clientX - current.left, current.width) * max);
    if (layerRef.current) {
      layerRef.current.style.transition = "";
      layerRef.current.style.transform = "";
    }
    setPreview(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = seekTarget(event.key, event.shiftKey, position, max);
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSeek(target);
  };

  const knobScale = preview !== null ? 1.1 : 1;
  const plainKnobVisibility = preview !== null ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100";
  const plainFillStyle = onArt ? { backgroundColor: fillColour } : undefined;

  const tip = hover !== null && !disabled && !compact ? <GrooveTip time={hoverTime} line={hoverLine} left={hover * 100} above={plain} /> : null;
  const tipStrip = !plain && !compact ? <div className="relative h-5">{tip}</div> : null;

  const slider = (
    <div
      role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={grooveValueText(shown, max)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => finish(event, false)}
        onLostPointerCapture={(event) => finish(event, false)}
        onPointerLeave={() => {
          if (!drag.current) setHover(null);
        }}
        className={`group relative w-full touch-none select-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${disabled ? "cursor-default opacity-[var(--disabled-opacity)]" : "cursor-pointer"}`}
        style={{ height: boxHeight }}
      >
        <span aria-hidden="true" className="absolute inset-x-0 bg-transparent" style={{ top: -hitPad, bottom: -hitPad }} />
        <div ref={layerRef} className="relative h-full w-full">
          {plain ? (
            <>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${onArt ? "bg-art/[0.22]" : "bg-ink-1/[0.16]"}`}
              />
              <span
                aria-hidden="true"
                style={{ width: `${progress * 100}%`, ...plainFillStyle }}
                className={`pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${onArt ? "" : "bg-accent"}`}
              />
            </>
          ) : (
            <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
          )}
          {!disabled && (
            <span
              data-groove-knob
              aria-hidden="true"
              style={{
                left: `${progress * 100}%`,
                top: boxHeight / 2,
                width: size.knob,
                height: size.knob,
                backgroundColor: fillColour,
                transform: `translate(-50%, -50%) scale(${knobScale})`,
              }}
              className={`pointer-events-none absolute rounded-full ring-1 ring-base ${plain ? `motion-safe:transition-opacity motion-safe:duration-quick ${plainKnobVisibility}` : ""}`}
            />
          )}
        </div>
      </div>
  );

  if (plain) {
    return (
      <div className={`flex h-4 w-full items-center gap-3 tabular-nums ${onArt ? "text-[13px] text-art/[0.72]" : "text-meta text-ink-2"} ${className}`}>
        <span className="flex h-4 min-w-[2.5rem] shrink-0 items-center justify-end leading-4">{fmtTime(shown)}</span>
        <div className="relative min-w-0 flex-1">
          {slider}
          {tip}
        </div>
        <span className="flex h-4 min-w-[2.5rem] shrink-0 items-center leading-4">{fmtTime(max)}</span>
      </div>
    );
  }

  return (
    <div className={`flex w-full flex-col tabular-nums ${onArt ? "text-[13px] text-art/[0.72]" : "text-meta text-ink-2"} ${className}`}>
      {tipStrip}
      {slider}
      <div className="mt-1 flex items-center justify-between leading-4">
        <span>{fmtTime(shown)}</span>
        <span>{fmtTime(max)}</span>
      </div>
    </div>
  );
}

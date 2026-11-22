import { t } from "../lib/i18n";
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { animate } from "motion/react";
import { CircleNotch, DotsThree, MusicNote, Pause, Play, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import {
  addEqPreset,
  checkPresetName,
  clampEqGain,
  cleanPresetName,
  deleteEqPreset,
  EQ_PRESETS,
  EQ_RANGE,
  flatGains,
  formatEqGain,
  presetMatching,
  presetNameMessage,
  renameEqPreset,
  sameGains,
  type EqPreset,
  updateEqPreset,
} from "../lib/eq";
import {
  bandFraction,
  bandSpoken,
  curveAnchors,
  DISPLAY_HZ,
  DISPLAY_LABELS,
  displayToEngine,
  engineToDisplay,
  EQ_MOODS,
  EQ_PLOT_ASPECT,
  eqValueText,
  gainToFraction,
  fractionToGain,
  keyGain,
  lerpGains,
  moodMatching,
  splineSamples,
  type Point,
} from "../lib/eqCurve";
import { fmtTime } from "../lib/format";
import { reducedMotion } from "../lib/motion";
import { usePhone } from "../lib/usePhone";
import { currentTrack, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI, type MenuItem } from "../stores/ui";

const HANDLE = "bg-surface text-ink-1 border border-separator shadow-sm";
const MOOD_NAMES = Object.keys(EQ_MOODS);
const BUILT_IN_MENU = Object.keys(EQ_PRESETS).filter((name) => name !== "Flat");

function EqGlyph({ icon }: { icon: PhosphorIcon }) {
  if (usePhone()) return <PhoneIcon icon={icon} size={24} />;
  return <Icon icon={icon} />;
}

function validName(raw: string, current?: string): string | null {
  const checked = checkPresetName(raw, useSettings.getState().eqPresets, current);
  if (checked.name !== undefined && !MOOD_NAMES.includes(checked.name)) return checked.name;
  const error = checked.name !== undefined ? "builtin" : checked.error;
  useUI.getState().toast(presetNameMessage(error, cleanPresetName(raw)), "error");
  return null;
}

function openSave() {
  useUI.getState().openDialog({
    title: "Save preset",
    placeholder: "Preset name",
    initialValue: "My preset",
    confirmLabel: t("dialog.save"),
    onConfirm: (value) => {
      const name = validName(value);
      if (name === null) return;
      const { eqPresets, eqGains, setValue } = useSettings.getState();
      setValue("eqPresets", addEqPreset(eqPresets, name, eqGains));
    },
  });
}

function openRename(from: string, onRenamed: (name: string) => void) {
  useUI.getState().openDialog({
    title: "Rename preset",
    placeholder: "Preset name",
    initialValue: from,
    confirmLabel: "Rename",
    onConfirm: (value) => {
      const name = validName(value, from);
      if (name === null) return;
      const { eqPresets, setValue } = useSettings.getState();
      setValue("eqPresets", renameEqPreset(eqPresets, from, name));
      onRenamed(name);
    },
  });
}

function openUnder(anchor: HTMLElement, items: MenuItem[]) {
  const rect = anchor.getBoundingClientRect();
  useUI.getState().openContextMenu(rect.right, rect.bottom + 6, items, { alignRight: true });
}

type PresetCtx = {
  enabled: boolean;
  anyMatch: boolean;
  engineMatch: string | null;
  selected: string | null;
  presets: EqPreset[];
  setSelected: (name: string | null) => void;
  applyExact: (gains: number[], name: string | null) => void;
  applyMood: (name: string) => void;
};

function presetItems(ctx: PresetCtx): MenuItem[] {
  const builtIns = BUILT_IN_MENU.map((name) => ({
    label: name,
    checked: ctx.engineMatch === name,
    onSelect: () => ctx.applyExact([...EQ_PRESETS[name]], null),
  }));
  const own = ctx.presets.map((preset, index) => ({
    label: preset.name,
    checked: ctx.engineMatch === preset.name,
    separatorBefore: index === 0 && builtIns.length > 0,
    onSelect: () => ctx.applyExact([...preset.gains], preset.name),
  }));
  return [...builtIns, ...own];
}

function manageItems(ctx: PresetCtx): MenuItem[] {
  const items: MenuItem[] = [
    { label: "Save as preset", separatorBefore: true, disabled: !ctx.enabled || ctx.anyMatch, onSelect: openSave },
    { label: "Reset to flat", disabled: sameGains(useSettings.getState().eqGains, flatGains()), onSelect: () => ctx.applyMood("Flat") },
  ];
  const own = ctx.selected === null ? undefined : ctx.presets.find((preset) => preset.name === ctx.selected);
  if (own) {
    items.push(
      { label: "Rename preset", separatorBefore: true, onSelect: () => openRename(own.name, ctx.setSelected) },
      {
        label: "Update to current curve",
        disabled: sameGains(own.gains, useSettings.getState().eqGains),
        onSelect: () => {
          const { eqPresets, eqGains, setValue } = useSettings.getState();
          setValue("eqPresets", updateEqPreset(eqPresets, own.name, eqGains));
        },
      },
      {
        label: "Delete preset",
        danger: true,
        separatorBefore: true,
        onSelect: () => {
          const { eqPresets, setValue } = useSettings.getState();
          setValue("eqPresets", deleteEqPreset(eqPresets, own.name));
          ctx.setSelected(null);
        },
      },
    );
  }
  return items;
}

function NowCover({ thumb }: { thumb: string | null }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden bg-wash text-ink-2"
      style={{ width: "clamp(44px, 9.2cqi, 92px)", height: "clamp(44px, 9.2cqi, 92px)", borderRadius: "clamp(12px, 1.8cqi, 18px)" }}
    >
      {thumb ? <img loading="lazy" decoding="async" src={thumb} alt="" className="h-full w-full object-cover" /> : <EqGlyph icon={MusicNote} />}
    </span>
  );
}

function Segment({ active, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`h-8 rounded-[8px] px-3 text-meta font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-safe:transition-colors ${active ? "bg-ink-1 text-[rgb(var(--base))]" : "text-ink-2 hover:bg-hover hover:text-ink-1"}`}
      {...props}
    >
      {children}
    </button>
  );
}

function paintInk(element: HTMLElement): [number, number, number] {
  const parts = getComputedStyle(element).color.match(/\d+(\.\d+)?/g);
  return parts && parts.length >= 3 ? [Number(parts[0]), Number(parts[1]), Number(parts[2])] : [128, 128, 128];
}

function plotY(gain: number, height: number): number {
  return gainToFraction(gain) * height;
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, ink: [number, number, number]) {
  const [r, g, b] = ink;
  const s = width / 1000;
  const top = Math.round(plotY(EQ_RANGE, height)) + 0.5;
  const bottom = Math.round(plotY(-EQ_RANGE, height)) + 0.5;
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
  ctx.beginPath();
  DISPLAY_HZ.forEach((_, index) => {
    const x = Math.round(bandFraction(index, DISPLAY_HZ.length) * width) + 0.5;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  });
  ctx.stroke();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
  ctx.beginPath();
  DISPLAY_HZ.forEach((_, index) => {
    const x = Math.round(bandFraction(index, DISPLAY_HZ.length) * width) + 0.5;
    for (let gain = -EQ_RANGE; gain <= EQ_RANGE; gain += 2) {
      const y = Math.round(plotY(gain, height)) + 0.5;
      ctx.moveTo(x - 8 * s, y);
      ctx.lineTo(x + 8 * s, y);
    }
  });
  ctx.stroke();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
  const zero = Math.round(plotY(0, height)) + 0.5;
  ctx.beginPath();
  ctx.moveTo(width * 0.072, zero);
  ctx.lineTo(width * 0.928, zero);
  ctx.stroke();
}

function accentRgb(): string {
  const parts = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().split(/\s+/).map(Number);
  return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite) ? `${parts[0]}, ${parts[1]}, ${parts[2]}` : "255, 107, 74";
}

function curvePath(ctx: CanvasRenderingContext2D, samples: Point[]) {
  ctx.beginPath();
  samples.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
}

function drawCurve(ctx: CanvasRenderingContext2D, width: number, height: number, points: Point[]) {
  const s = width / 1000;
  const accent = accentRgb();
  const samples = splineSamples(curveAnchors(points, width), 16);
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return;
  const zero = plotY(0, height);
  curvePath(ctx, samples);
  ctx.lineTo(last.x, zero);
  ctx.lineTo(first.x, zero);
  ctx.closePath();
  ctx.fillStyle = `rgba(${accent}, 0.12)`;
  ctx.fill();
  curvePath(ctx, samples);
  ctx.strokeStyle = `rgba(${accent}, 1)`;
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

type Drag = { index: number; pointerId: number; offset: number };

function EqPlot({ display, enabled, onBandChange }: { display: readonly number[]; enabled: boolean; onBandChange: (index: number, gain: number) => void }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const valueRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const shown = useRef<number[]>([...display]);
  const sizeRef = useRef({ width: 0, height: 0 });
  const drag = useRef<Drag | null>(null);
  const motionRef = useRef<{ stop: () => void } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const paint = () => {
    const canvas = canvasRef.current;
    const { width, height } = sizeRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height, paintInk(canvas));
    const points = shown.current.map((gain, index) => ({ x: bandFraction(index, DISPLAY_HZ.length) * width, y: plotY(gain, height) }));
    drawCurve(ctx, width, height, points);
    shown.current.forEach((gain, index) => {
      const handle = handleRefs.current[index];
      if (handle) handle.style.top = `${gainToFraction(gain) * 100}%`;
      const value = valueRefs.current[index];
      if (value) value.textContent = formatEqGain(Math.round(gain));
    });
  };

  useLayoutEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const measure = () => {
      sizeRef.current = { width: element.clientWidth, height: element.clientHeight };
      paint();
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => paint());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (drag.current) {
      paint();
      return;
    }
    const from = shown.current.slice();
    const moved = from.some((value, index) => Math.abs(value - (display[index] ?? 0)) > 0.01);
    if (!moved || reducedMotion()) {
      shown.current = [...display];
      paint();
      return;
    }
    const controls = animate(0, 1, {
      type: "spring",
      visualDuration: 0.35,
      bounce: 0,
      onUpdate: (t) => {
        shown.current = lerpGains(from, display, t);
        paint();
      },
    });
    motionRef.current = controls;
    return () => controls.stop();
  }, [display]);

  const fractionY = (event: PointerEvent<HTMLDivElement>) => {
    const plot = plotRef.current;
    if (!plot) return 0;
    const rect = plot.getBoundingClientRect();
    return rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
  };

  function startDrag(event: PointerEvent<HTMLDivElement>, index: number) {
    if (event.isPrimary === false || !plotRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
    motionRef.current?.stop();
    drag.current = { index, pointerId: event.pointerId, offset: gainToFraction(display[index] ?? 0) - fractionY(event) };
    setDragging(index);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>, index: number) {
    const current = drag.current;
    if (!current || current.index !== index || current.pointerId !== event.pointerId) return;
    const gain = fractionToGain(fractionY(event) + current.offset);
    if (gain === display[index]) return;
    shown.current[index] = gain;
    onBandChange(index, gain);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    paint();
  }

  function onKey(event: KeyboardEvent<HTMLDivElement>, index: number) {
    const next = keyGain(display[index] ?? 0, event.key);
    if (next === null) return;
    event.preventDefault();
    if (next !== display[index]) onBandChange(index, next);
  }

  return (
    <div className={`flex flex-col motion-safe:transition-opacity motion-safe:duration-quick ${enabled ? "" : "opacity-50"}`}>
      <div ref={plotRef} className="relative w-full touch-none select-none" style={{ aspectRatio: EQ_PLOT_ASPECT }}>
        <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-ink-1" />
        {DISPLAY_HZ.map((hz, index) => {
          const gain = display[index] ?? 0;
          return (
            <div
              key={hz}
              ref={(node) => {
                handleRefs.current[index] = node;
              }}
              role="slider"
              tabIndex={0}
              aria-label={bandSpoken(hz)}
              aria-orientation="vertical"
              aria-valuemin={-EQ_RANGE}
              aria-valuemax={EQ_RANGE}
              aria-valuenow={clampEqGain(gain)}
              aria-valuetext={eqValueText(hz, gain)}
              className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize place-items-center rounded-full"
              style={{ left: `${bandFraction(index, DISPLAY_HZ.length) * 100}%`, top: `${gainToFraction(gain) * 100}%` }}
              onPointerDown={(event) => startDrag(event, index)}
              onPointerMove={(event) => moveDrag(event, index)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => onKey(event, index)}
              onDoubleClick={() => onBandChange(index, 0)}
            >
              <span
                ref={(node) => {
                  valueRefs.current[index] = node;
                }}
                aria-hidden="true"
                className={`flex items-center justify-center rounded-[9px] font-medium tabular-nums motion-safe:transition-transform motion-safe:duration-quick ${HANDLE} ${dragging === index ? "scale-110" : ""}`}
                style={{
                  width: "clamp(46px, 5.8cqi, 58px)",
                  height: "clamp(28px, 3.4cqi, 34px)",
                  fontSize: "clamp(12px, 1.6cqi, 16px)",
                  borderRadius: "clamp(7px, 0.9cqi, 9px)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="relative mt-2" style={{ height: "clamp(18px, 2.4cqi, 24px)" }}>
        {DISPLAY_LABELS.map((label, index) => (
          <span
            key={label}
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap tabular-nums text-ink-2"
            style={{ left: `${bandFraction(index, DISPLAY_LABELS.length) * 100}%`, fontSize: "clamp(11px, 1.5cqi, 15px)" }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SeekBar({ position, duration, onSeek }: { position: number; duration: number; onSeek: (seconds: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [draft, setDraft] = useState<number | null>(null);
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const current = Math.min(max, Math.max(0, draft ?? (Number.isFinite(position) ? position : 0)));
  const fraction = max ? current / max : 0;

  function at(clientX: number): number {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return current;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * max;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!max) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + 5;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - 5;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    onSeek(Math.min(max, Math.max(0, next)));
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={max ? 0 : -1}
      aria-label="Seek"
      aria-disabled={!max || undefined}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${fmtTime(current)} of ${fmtTime(max)}`}
      className="relative min-w-0 flex-1 cursor-pointer touch-none select-none disabled:cursor-default"
      style={{ height: 26 }}
      onPointerDown={(event) => {
        if (!max) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDraft(at(event.clientX));
      }}
      onPointerMove={(event) => {
        if (dragging.current) setDraft(at(event.clientX));
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        const next = at(event.clientX);
        setDraft(null);
        onSeek(next);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        setDraft(null);
      }}
      onKeyDown={onKeyDown}
    >
      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink-1/15" />
      <span className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink-1" style={{ width: `${fraction * 100}%` }} />
      <span
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-1 text-[rgb(var(--base))]"
        style={{ left: `${fraction * 100}%` } as CSSProperties}
      />
    </div>
  );
}

function Transport() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const toggle = usePlayer((state) => state.toggle);
  const seek = usePlayer((state) => state.seek);
  const max = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const shownPosition = Number.isFinite(position) ? Math.min(max, Math.max(0, position)) : 0;

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        disabled={!track}
        onClick={() => toggle()}
        className="grid shrink-0 place-items-center bg-ink-1 text-[rgb(var(--base))] disabled:opacity-40 motion-safe:transition-transform motion-safe:active:scale-95"
        style={{ width: "clamp(44px, 5.2cqi, 52px)", height: "clamp(44px, 5.2cqi, 52px)", borderRadius: "clamp(10px, 1.2cqi, 12px)" }}
      >
        {buffering ? <EqGlyph icon={CircleNotch} /> : <EqGlyph icon={playing ? Pause : Play} />}
      </button>
      <span className="shrink-0 tabular-nums text-ink-2" style={{ fontSize: "clamp(12px, 1.6cqi, 16px)" }}>
        {fmtTime(shownPosition)}
      </span>
      <SeekBar position={shownPosition} duration={max} onSeek={seek} />
      <span className="shrink-0 tabular-nums text-ink-2" style={{ fontSize: "clamp(12px, 1.6cqi, 16px)" }}>
        {fmtTime(max)}
      </span>
    </div>
  );
}

export function Equalizer() {
  const enabled = useSettings((state) => state.eqEnabled);
  const gains = useSettings((state) => state.eqGains);
  const presets = useSettings((state) => state.eqPresets);
  const setEqGains = useSettings((state) => state.setEqGains);
  const track = usePlayer(currentTrack);
  const [display, setDisplay] = useState<number[]>(() => engineToDisplay(gains));
  const [selected, setSelected] = useState<string | null>(null);
  const written = useRef<number[] | null>(null);

  useEffect(() => {
    if (written.current && sameGains(gains, written.current)) return;
    setDisplay(engineToDisplay(gains));
  }, [gains]);

  function write(next: readonly number[]) {
    const engine = displayToEngine(next);
    written.current = engine;
    setEqGains(engine);
  }

  function changeBand(index: number, gain: number) {
    const next = [...display];
    next[index] = clampEqGain(gain);
    setDisplay(next);
    write(next);
  }

  function applyMood(name: string) {
    const next = [...EQ_MOODS[name]];
    setSelected(null);
    setDisplay(next);
    write(next);
  }

  function applyExact(next: number[], name: string | null) {
    setSelected(name);
    written.current = next;
    setEqGains(next);
    setDisplay(engineToDisplay(next));
  }

  const mood = moodMatching(display);
  const engineMatch = presetMatching(gains, presets);
  const ctx: PresetCtx = {
    enabled,
    anyMatch: mood !== null || engineMatch !== null,
    engineMatch,
    selected,
    presets,
    setSelected,
    applyExact,
    applyMood,
  };

  return (
    <div className="flex flex-col gap-8" style={{ containerType: "inline-size" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-[clamp(10px,2.4cqi,24px)]">
          <NowCover thumb={track?.thumb ?? null} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-1" style={{ fontSize: "clamp(15px, 2cqi, 20px)" }}>
              {track?.title ?? "Nothing playing"}
            </p>
            <p className="truncate text-ink-2" style={{ fontSize: "clamp(13px, 1.7cqi, 17px)" }}>
              {track?.artist ?? "Start a song to hear the change"}
            </p>
          </div>
        </div>
        <div className="flex max-w-full items-center gap-2">
          <div role="group" aria-label="Presets" className="flex min-w-0 flex-wrap items-center gap-1">
            {MOOD_NAMES.map((name) => (
              <Segment key={name} active={mood === name} onClick={() => applyMood(name)}>
                {name}
              </Segment>
            ))}
          </div>
          <button
            type="button"
            aria-label="Preset actions"
            aria-haspopup="menu"
            onClick={(event) => openUnder(event.currentTarget, [...presetItems(ctx), ...manageItems(ctx)])}
            className="grid size-9 shrink-0 place-items-center rounded-[8px] text-ink-2 hover:bg-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <EqGlyph icon={DotsThree} />
          </button>
        </div>
      </div>
      <EqPlot display={display} enabled={enabled} onBandChange={changeBand} />
      <Transport />
    </div>
  );
}

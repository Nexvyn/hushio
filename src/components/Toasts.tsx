import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, type PanInfo } from "motion/react";
import { CheckCircle, Info, WarningCircle, X, type Icon as PhosphorIcon, type IconWeight } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { haptic } from "../lib/haptics";
import { INSET_TOP } from "../lib/phoneNav";
import { fade, instant, progressFill, quick, reducedMotion, toastOut, toastStack } from "../lib/motion";
import {
  isSwipeDismiss,
  pauseLifetime,
  progressPercent,
  resumeLifetime,
  stackSlot,
  toastLifetime,
  type Lifetime,
  type Placement,
} from "../lib/toastStack";
import { usePageVisible } from "../lib/usePageVisible";
import { usePhone } from "../lib/usePhone";
import { useUI, type Toast, type ToastKind } from "../stores/ui";

type KindStyle = {
  icon: PhosphorIcon;
  weight: IconWeight;
  tone: string;
};

const KIND_STYLES: Record<ToastKind, KindStyle> = {
  info: { icon: Info, weight: "regular", tone: "text-white/70" },
  success: { icon: CheckCircle, weight: "regular", tone: "text-white" },
  error: { icon: WarningCircle, weight: "regular", tone: "text-danger-text" },
  warning: { icon: WarningCircle, weight: "regular", tone: "text-warn" },
};

type CardProps = {
  toast: Toast;
  depth: number;
  placement: Placement;
  expanded: boolean;
  paused: boolean;
  phone: boolean;
  reduced: boolean;
};

function ToastCard({ toast, depth, placement, expanded, paused, phone, reduced }: CardProps) {
  const dismissToast = useUI((state) => state.dismissToast);
  const slot = stackSlot(depth, placement, expanded);
  const style = KIND_STYLES[toast.kind];
  const Glyph = phone ? PhoneIcon : Icon;
  const total = toastLifetime(toast.kind, Boolean(toast.action), toast.duration);
  const bump = toast.bump ?? 0;
  const life = useRef<Lifetime>({ remaining: total, startedAt: null });
  const lifeBump = useRef(bump);
  const pulseBump = useRef(bump);
  const closing = useRef(false);
  const pulse = useAnimationControls();
  const enterY = placement === "top" ? -12 : 12;
  const action = toast.action;

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    dismissToast(toast.id);
  }, [dismissToast, toast.id]);

  useEffect(() => {
    if (!phone) return;
    if (toast.kind === "error" || toast.kind === "warning") haptic("warning");
    else if (toast.kind === "success") haptic("tick");
  }, [phone, toast.kind]);

  useEffect(() => {
    if (bump === pulseBump.current) return;
    pulseBump.current = bump;
    void pulse.start(reduced ? { opacity: [1, 0.72, 1], transition: fade } : { scale: [1, 1.035, 1], transition: quick });
  }, [bump, pulse, reduced]);

  useEffect(() => {
    if (bump !== lifeBump.current) {
      lifeBump.current = bump;
      life.current = { remaining: total, startedAt: null };
    }
    if (paused) return;
    life.current = resumeLifetime(life.current, Date.now());
    const timer = setTimeout(close, life.current.remaining);
    return () => {
      clearTimeout(timer);
      life.current = pauseLifetime(life.current, Date.now());
    };
  }, [paused, bump, total, close]);

  const onDragEnd = (_event: unknown, info: PanInfo) => {
    if (isSwipeDismiss(info.offset, info.velocity)) close();
  };

  return (
    <motion.div
      role={toast.kind === "error" ? "alert" : "status"}
      layout="position"
      className={`group flex w-max max-w-full mx-auto ${
        slot.inFlow ? "" : `absolute left-0 right-0 ${placement === "top" ? "top-0" : "bottom-0"}`
      } ${slot.visible ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ zIndex: slot.zIndex }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: enterY, scale: 0.96 }}
      animate={{
        opacity: slot.visible ? 1 : 0,
        y: slot.y,
        scale: slot.scale,
        transition: reduced ? fade : toastStack,
      }}
      exit={reduced ? { opacity: 0, transition: fade } : { opacity: 0, y: enterY, scale: 0.98, transition: toastOut }}
    >
      <motion.div
        animate={pulse}
        drag={phone}
        dragConstraints={{ top: -120, bottom: 0, left: -240, right: 240 }}
        dragElastic={0.25}
        dragSnapToOrigin
        onDragEnd={phone ? onDragEnd : undefined}
        className="relative flex min-h-[48px] min-w-[220px] max-w-[min(420px,calc(100vw-32px))] select-none items-center gap-3 overflow-hidden rounded-[18px] bg-scrim/[0.96] py-2 pl-2 pr-3 text-on-scrim shadow-[0_10px_30px_rgb(0_0_0/0.28),inset_0_0_0_1px_rgb(255_255_255/0.08)]"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center">
          {toast.art ? (
            <img src={toast.art} alt="" decoding="async" className="h-7 w-7 rounded-[6px] object-cover" />
          ) : (
            <span className={style.tone}>
              <Glyph icon={style.icon} weight={style.weight} />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-meta font-semibold leading-snug">{toast.message}</span>
          {toast.detail && (
            <span className="block truncate text-meta leading-snug text-white/60">{toast.detail}</span>
          )}
        </span>
        {action && (
          <button
            type="button"
            onClick={() => {
              action.run();
              close();
            }}
            className="relative h-9 shrink-0 rounded-full px-3 text-meta font-semibold text-on-scrim hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss notification"
          onClick={close}
          className="hit-area grid h-6 w-6 shrink-0 place-items-center rounded-full text-white/60 opacity-60 hover:bg-white/10 hover:text-white focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 group-hover:opacity-100 motion-safe:transition-[opacity,background-color,color] motion-safe:duration-quick"
        >
          <Glyph icon={X} />
        </button>
        {toast.progress !== undefined && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
            <motion.span
              className="block h-full origin-left bg-on-scrim/40"
              initial={false}
              animate={{ scaleX: progressPercent(toast.progress) / 100 }}
              transition={reduced ? instant : progressFill}
            />
          </span>
        )}
      </motion.div>
    </motion.div>
  );
}

export function Toasts() {
  const toasts = useUI((state) => state.toasts);
  const dismissToast = useUI((state) => state.dismissToast);
  const phone = usePhone();
  const reduced = reducedMotion();
  const visible = usePageVisible();
  const [hovered, setHovered] = useState(false);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const stack = useRef<HTMLDivElement>(null);
  const expanded = hovered || touched || focused;
  const paused = expanded || !visible;
  const placement: Placement = phone ? "top" : "bottom";
  const hasToasts = toasts.length > 0;

  useEffect(() => {
    setFocused(stack.current?.contains(document.activeElement) ?? false);
  }, [toasts]);

  useEffect(() => {
    if (!hasToasts) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const ui = useUI.getState();
      if (ui.dialog || ui.contextMenu || ui.playlistPicker) return;
      const newest = ui.toasts[ui.toasts.length - 1];
      if (newest) dismissToast(newest.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasToasts, dismissToast]);

  const ordered = [...toasts].reverse();

  return (
    <div
      ref={stack}
      className={`pointer-events-none fixed left-1/2 z-[110] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 items-center gap-2 ${
        placement === "top" ? "flex-col" : "flex-col-reverse bottom-[100px]"
      }`}
      style={phone ? { top: `calc(${INSET_TOP} + 8px)` } : undefined}
      onMouseEnter={phone ? undefined : () => setHovered(true)}
      onMouseLeave={phone ? undefined : () => setHovered(false)}
      onPointerDown={phone ? () => setTouched(true) : undefined}
      onPointerUp={() => setTouched(false)}
      onPointerCancel={() => setTouched(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <AnimatePresence initial={false}>
        {ordered.map((toast, depth) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            depth={depth}
            placement={placement}
            expanded={expanded}
            paused={paused}
            phone={phone}
            reduced={reduced}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

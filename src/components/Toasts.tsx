import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert02Icon,
  Cancel01Icon,
  InformationCircleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Icon } from "./Icon";
import { DEFAULT_TOAST_MS, useUI, type Toast } from "../stores/ui";
import { DURATION_MS } from "../lib/motion";

type KindStyle = {
  icon: IconSvgElement;
  tint: string;
  badge: string;
  glow: string;
};

const KIND_STYLES: Record<Toast["kind"], KindStyle> = {
  info: {
    icon: InformationCircleIcon,
    tint: "text-ink-1",
    badge: "bg-ink-1/[0.14]",
    glow: "--ink-1",
  },
  success: {
    icon: Tick02Icon,
    tint: "text-safe",
    badge: "bg-safe/[0.16]",
    glow: "--safe",
  },
  error: {
    icon: Cancel01Icon,
    tint: "text-danger-text",
    badge: "bg-danger/[0.16]",
    glow: "--danger",
  },
  warning: {
    icon: Alert02Icon,
    tint: "text-warn",
    badge: "bg-warn/[0.16]",
    glow: "--warn",
  },
};

function ToastCard({ toast }: { toast: Toast }) {
  const dismissToast = useUI((state) => state.dismissToast);
  const duration = toast.duration && toast.duration > 0 ? toast.duration : DEFAULT_TOAST_MS;
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(duration);
  const closing = useRef(false);
  const style = KIND_STYLES[toast.kind];

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    setTimeout(() => dismissToast(toast.id), DURATION_MS.settle);
  }, [dismissToast, toast.id]);

  useEffect(() => {
    if (paused || closing.current) return;
    const startedAt = performance.now();
    const timer = setTimeout(close, Math.max(0, remaining.current));
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - startedAt));
    };
  }, [paused, close]);

  return (
    <div
      role="status"
      className={`group pointer-events-auto relative ${leaving ? "toast-leave" : "toast-enter"}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-5 rounded-full blur-lg motion-safe:transition-opacity motion-safe:duration-swap"
        style={{
          background: `radial-gradient(closest-side, rgb(var(${style.glow}) / 0.20), transparent)`,
          opacity: paused ? 1 : 0.5,
        }}
      />
      <div className="toast-beacon relative flex min-w-[320px] max-w-[440px] items-center gap-3 overflow-hidden rounded-full py-1.5 pl-1.5 pr-2">
        <span className="relative h-9 w-9 shrink-0">
          <span
            className={`absolute inset-[6px] grid place-items-center rounded-full ${style.badge} ${style.tint}`}
          >
            <Icon icon={style.icon} />
          </span>
        </span>
        <p className="select-none pr-0.5 text-[13px] font-medium leading-snug text-ink-1">
          {toast.message}
        </p>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.run();
              close();
            }}
            className="relative grid h-10 shrink-0 place-items-center rounded-full px-3 text-[13px] font-semibold text-ink-1 hover:bg-ink-1/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss notification"
          onClick={close}
          className="hit-area relative ml-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-2 opacity-0 motion-safe:transition-[opacity,background-color,color] motion-safe:duration-quick hover:bg-ink-1/10 hover:text-ink-1 focus:opacity-100 group-hover:opacity-100"
        >
          <Icon icon={Cancel01Icon} />
        </button>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((state) => state.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 top-[78px] z-[110] flex -translate-x-1/2 flex-col items-center gap-2.5">
      {[...toasts].reverse().map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

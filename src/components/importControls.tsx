import { X } from "@phosphor-icons/react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, type Transition } from "motion/react";
import { DURATION_MS, EASE_OUT, fade, reducedMotion } from "../lib/motion";
import { usePhone } from "../lib/usePhone";
import { Icon } from "./Icon";
import { Sheet } from "./phone/Sheet";

type ImportButtonVariant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex h-11 min-w-[112px] shrink-0 items-center justify-center gap-2 rounded-[8px] px-4 text-body font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-[opacity,transform,background-color] motion-safe:duration-quick motion-safe:ease-out motion-safe:active:scale-[0.96]";

const VARIANTS: Record<ImportButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-separator text-ink-1 hover:bg-hover",
  ghost: "text-ink-1 hover:bg-hover",
};

export function ImportButton({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ImportButtonVariant }) {
  return <button type={type} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

const panelIn: Transition = { duration: DURATION_MS.dialogIn / 1000, ease: EASE_OUT };
const scrimIn: Transition = { duration: DURATION_MS.reading / 1000, ease: EASE_OUT };

export function ImportModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const phone = usePhone();

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (phone) {
    return (
      <Sheet label={title} onClose={onClose} header={<h2 className="text-card-title font-semibold text-ink-1">{title}</h2>}>
        <div className="px-4 pb-6">{children}</div>
      </Sheet>
    );
  }
  return <DesktopModal title={title} onClose={onClose}>{children}</DesktopModal>;
}

function DesktopModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = panel.current?.querySelector<HTMLElement>("input, textarea") ?? panel.current;
    target?.focus();
  }, []);

  const reduced = reducedMotion();
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? fade : scrimIn}
        onMouseDown={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="glass-strong relative flex max-h-[80vh] w-[min(520px,calc(100vw-48px))] flex-col rounded-2xl p-6 outline-none"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={reduced ? fade : panelIn}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-card-title font-semibold text-ink-1">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-[8px] text-ink-2 hover:bg-hover hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-safe:transition-colors"
          >
            <Icon icon={X} />
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
      </motion.div>
    </div>
  );
}

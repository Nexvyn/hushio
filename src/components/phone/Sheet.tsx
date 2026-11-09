import { useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { fade, instant, reducedMotion, settle } from "../../lib/motion";
import { INSET_BOTTOM } from "../../lib/phoneNav";
import { useSheetDrag } from "./useSheetDrag";

type SheetProps = {
  label: string;
  onClose: () => void;
  header?: ReactNode;
  height?: string;
  zClass?: string;
  children: ReactNode;
};

export function Sheet({ label, onClose, header, height, zClass = "z-[115]", children }: SheetProps) {
  const reduced = reducedMotion();
  const panel = useRef<HTMLElement>(null);
  const drag = useSheetDrag(panel, onClose, (event) => {
    const target = event.target as HTMLElement;
    return target.closest("[data-sheet-grab]") !== null;
  });
  const transition = drag.live ? instant : reduced ? fade : settle;

  return (
    <motion.div className={`fixed inset-0 ${zClass} flex flex-col justify-end`}>
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        onClick={onClose}
      />
      <motion.section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={reduced ? { opacity: 0 } : { y: "100%" }}
        animate={{ y: drag.offset, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { y: "100%" }}
        transition={transition}
        {...drag.handlers}
        className="relative flex w-full flex-col overflow-hidden rounded-t-[16px] border-t border-separator bg-elevated text-ink-1"
        style={{ height, maxHeight: "90vh", paddingBottom: INSET_BOTTOM }}
      >
        <div data-sheet-grab className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-2">
          <span aria-hidden="true" className="h-1 w-8 rounded-full bg-ink-3" />
        </div>
        {header && (
          <div data-sheet-grab className="shrink-0 px-4 pb-2 touch-none">
            {header}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </motion.section>
    </motion.div>
  );
}

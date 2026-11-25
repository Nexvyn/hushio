import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useTransform } from "motion/react";
import { fade, phoneSmooth, phoneTransition, reducedMotion } from "../../lib/motion";
import { INSET_BOTTOM } from "../../lib/phoneNav";
import { viewportHeight } from "../../lib/viewport";
import { sheetBodyAtTop, useSheetDrag } from "./useSheetDrag";

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
  const body = useRef<HTMLDivElement>(null);
  const travel = useRef(0);
  const drag = useSheetDrag(
    onClose,
    (event) => {
      const target = event.target as Element;
      if (target.closest("[data-sheet-grab]")) return "grab";
      const root = body.current;
      return root !== null && root.contains(target) && sheetBodyAtTop(target, root) ? "content" : null;
    },
    undefined,
    () => travel.current || viewportHeight(),
  );
  const scrimOpacity = useTransform(drag.y, (y) => 1 - Math.min(1, Math.max(0, y / (travel.current || viewportHeight()))));

  useLayoutEffect(() => {
    travel.current = panel.current?.offsetHeight ?? 0;
    if (!reduced) drag.y.set(travel.current || viewportHeight());
  }, []);

  return createPortal(
    <motion.div spellCheck={false} className={`fixed inset-0 ${zClass} flex select-none flex-col justify-end`}>
      <motion.div
        aria-hidden="true"
        className={reduced ? "absolute inset-0" : "absolute inset-0 will-change-[opacity]"}
        style={{ background: "rgb(var(--scrim) / var(--scrim-alpha))", opacity: reduced ? undefined : scrimOpacity }}
        initial={reduced ? { opacity: 0 } : undefined}
        animate={reduced ? { opacity: 1 } : undefined}
        exit={reduced ? { opacity: 0 } : undefined}
        transition={reduced ? fade : undefined}
        onClick={onClose}
      />
      <motion.section
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={reduced ? { opacity: 0 } : undefined}
        animate={{ y: 0, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { y: travel.current || viewportHeight() }}
        transition={phoneTransition(reduced, phoneSmooth)}
        {...drag.handlers}
        className="relative flex w-full flex-col overflow-hidden rounded-t-[20px] bg-elevated text-ink-1 will-change-transform"
        style={{ height, maxHeight: "90vh", paddingBottom: INSET_BOTTOM, y: drag.y }}
      >
        <div data-sheet-grab className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-2">
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-ink-3" />
        </div>
        {header && (
          <div data-sheet-grab className="shrink-0 px-4 pb-2 touch-none">
            {header}
          </div>
        )}
        <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
      </motion.section>
    </motion.div>,
    document.body,
  );
}

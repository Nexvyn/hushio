import { AnimatePresence, motion, type Transition } from "motion/react";
import type { ReactNode } from "react";
import { DURATION_MS, EASE_OUT, fade, pickerOut, quick, reducedMotion } from "../lib/motion";
import type { NavDirection } from "../lib/navDirection";

const SLIDE_PX = 16;
const pageIn: Transition = { duration: DURATION_MS.pageIn / 1000, ease: EASE_OUT };

type ViewTransitionProps = {
  routeKey: string;
  direction?: NavDirection;
  className?: string;
  children: ReactNode;
};

export function ViewTransition({ routeKey, direction = "none", className = "", children }: ViewTransitionProps) {
  const reduced = reducedMotion();
  const slide = reduced || direction === "tab" || direction === "none" ? 0 : direction === "push" ? SLIDE_PX : -SLIDE_PX;
  const enter = reduced ? fade : slide === 0 ? quick : pageIn;

  return (
    <div className="grid">
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={routeKey}
          data-route-transition={direction}
          initial={{ opacity: 0, x: slide }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0, transition: fade } : { opacity: 0, x: -slide, transition: pickerOut }}
          transition={enter}
          className={`${className} col-start-1 row-start-1`}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

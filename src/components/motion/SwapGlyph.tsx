import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fade, phoneSnappy, reducedMotion } from "../../lib/motion";

export function SwapGlyph({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  const reduced = reducedMotion();
  return (
    <span className="grid place-items-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={swapKey}
          className="col-start-1 row-start-1 grid place-items-center"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: -45 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5, rotate: 45 }}
          transition={reduced ? fade : phoneSnappy}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

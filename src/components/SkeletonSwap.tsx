import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { fade, gate, reducedMotion } from "../lib/motion";

export function SkeletonFade({ show, children }: { show: boolean; children: ReactNode }) {
  const reduced = reducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {show && (
        <motion.div key="skeleton" exit={{ opacity: 0 }} transition={gate(reduced, fade)}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SkeletonSwap({ loading, skeleton, children }: { loading: boolean; skeleton: ReactNode; children: ReactNode }) {
  const reduced = reducedMotion();
  const [startedLoading] = useState(loading);
  return (
    <div className="relative">
      <SkeletonFade show={loading}>{skeleton}</SkeletonFade>
      {!loading && (
        <motion.div
          initial={startedLoading ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={gate(reduced, fade)}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}

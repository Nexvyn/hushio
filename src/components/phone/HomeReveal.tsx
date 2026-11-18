import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { revealDelayMs, revealMode, type HomeRevealPlan, type RevealMode } from "../../lib/homeIntro";
import { DURATION_MS, EASE_OUT, reducedMotion } from "../../lib/motion";

export function HomeReveal({ plan, index, children }: { plan: HomeRevealPlan; index: number; children: ReactNode }) {
  const [mode] = useState<RevealMode>(() =>
    revealMode({
      intro: plan.intro,
      firstPaint: !plan.painted,
      elapsedMs: performance.now() - plan.mountedAt,
      reduced: reducedMotion(),
    }),
  );
  if (mode === "still") return <>{children}</>;
  if (mode === "append") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DURATION_MS.introAppend / 1000, ease: EASE_OUT }}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_MS.introItem / 1000, ease: EASE_OUT, delay: revealDelayMs(index) / 1000 }}
    >
      {children}
    </motion.div>
  );
}

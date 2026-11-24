import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { MS_FADE, SPRING_NAV, fade, phoneTween, reducedMotion } from "../lib/motion";
import type { NavDirection } from "../lib/navDirection";

type ViewTransitionProps = {
  routeKey: string;
  direction?: NavDirection;
  className?: string;
  children: ReactNode;
};

export function ViewTransition({ routeKey, direction = "none", className = "", children }: ViewTransitionProps) {
  const reduced = reducedMotion();
  const offset = direction === "push" ? "12vw" : direction === "pop" ? "-12vw" : 0;
  const initial = reduced || direction === "tab" || direction === "none" ? { opacity: 0 } : { opacity: 0, x: offset };
  const exit = reduced
    ? { opacity: 0, transition: fade }
    : direction === "tab" || direction === "none"
      ? { opacity: 0, transition: phoneTween(MS_FADE) }
      : { opacity: 0, x: typeof offset === "number" ? 0 : offset.startsWith("-") ? "12vw" : "-12vw", transition: SPRING_NAV };

  return (
    <div className="grid">
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={routeKey}
          data-route-transition={direction}
          initial={initial}
          animate={{ opacity: 1, x: 0 }}
          exit={exit}
          transition={direction === "push" || direction === "pop" ? { x: SPRING_NAV, opacity: phoneTween(MS_FADE) } : phoneTween(MS_FADE)}
          className={`${className} col-start-1 row-start-1`}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

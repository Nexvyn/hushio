import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { RING_LENGTH, RING_RADIUS, downloadVisual, ringDashOffset } from "../../lib/downloadRing";
import { EASE_OUT, fade, reducedMotion } from "../../lib/motion";

type DownloadRingProps = {
  busy: boolean;
  done: boolean;
  progress: number;
  idle: ReactNode;
  size?: number;
};

export function DownloadRing({ busy, done, progress, idle, size = 20 }: DownloadRingProps) {
  const reduced = reducedMotion();
  const visual = downloadVisual(busy, done);
  const instant = { duration: 0 };
  const ease = reduced ? instant : { duration: 0.3, ease: EASE_OUT };
  const swap = reduced ? fade : { duration: 0.2, ease: EASE_OUT };

  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }}>
      <AnimatePresence initial={false} mode="popLayout">
        {visual === "busy" && (
          <motion.svg
            key="busy"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            aria-hidden="true"
            className="absolute inset-0 -rotate-90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={swap}
          >
            <circle cx="12" cy="12" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
            <motion.circle
              cx="12"
              cy="12"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              initial={false}
              animate={{ strokeDashoffset: ringDashOffset(progress) }}
              transition={ease}
            />
          </motion.svg>
        )}
        {visual === "done" && (
          <motion.svg
            key="done"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            aria-hidden="true"
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={reduced ? instant : { duration: 0.25, ease: EASE_OUT }}
          >
            <circle cx="12" cy="12" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="2" />
            <motion.path
              d="M7.5 12.5l3 3 6-6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduced ? instant : { duration: 0.35, delay: 0.1, ease: EASE_OUT }}
            />
          </motion.svg>
        )}
        {visual === "idle" && (
          <motion.span
            key="idle"
            className="grid place-items-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={reduced ? instant : { duration: 0.2, ease: EASE_OUT }}
          >
            {idle}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

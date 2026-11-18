import { AnimatePresence, motion } from "motion/react";
import { Heart } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { EASE_OUT, PHONE_MS, phoneBouncy, reducedMotion } from "../../lib/motion";

export function CoverLikeBurst({ count }: { count: number }) {
  const reduced = reducedMotion();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid place-items-center text-white drop-shadow-lg"
          initial={reduced ? { opacity: 0 } : { opacity: 1, scale: 0.4 }}
          animate={reduced ? { opacity: [0, 1, 0] } : { opacity: 0, scale: 1 }}
          transition={
            reduced
              ? { duration: (PHONE_MS.likeBeat * 2) / 1000, times: [0, 0.5, 1], ease: EASE_OUT }
              : {
                  scale: phoneBouncy,
                  opacity: { delay: PHONE_MS.likeHold / 1000, duration: PHONE_MS.likeFade / 1000, ease: EASE_OUT },
                }
          }
        >
          <PhoneIcon icon={Heart} size={96} fill="currentColor" />
        </motion.span>
      )}
    </AnimatePresence>
  );
}

import { AnimatePresence, motion } from "motion/react";
import { Heart } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { EASE_OUT, PHONE_MS } from "../../lib/motion";

export function CoverLikeBurst({ count }: { count: number }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.span
          key={count}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid place-items-center text-white drop-shadow-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: (PHONE_MS.likeBeat * 2) / 1000, times: [0, 0.5, 1], ease: EASE_OUT }}
        >
          <PhoneIcon icon={Heart} size={96} fill="currentColor" />
        </motion.span>
      )}
    </AnimatePresence>
  );
}

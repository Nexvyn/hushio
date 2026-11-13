import { AnimatePresence, motion } from "motion/react";
import { Loading03Icon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { PhoneIcon } from "./PhoneIcon";
import { PHONE_MS, fade, phoneTween, reducedMotion } from "../../lib/motion";
import { usePageVisible } from "../../lib/usePageVisible";

export function useLoopAllowed(): boolean {
  const visible = usePageVisible();
  return visible && !reducedMotion();
}

export function Spinner({ size = 24 }: { size?: number }) {
  const loop = useLoopAllowed();
  return (
    <span className={loop ? "grid animate-spin place-items-center" : "grid place-items-center"}>
      <PhoneIcon icon={Loading03Icon} size={size} />
    </span>
  );
}

export function PlayPauseGlyph({ playing, buffering, size = 24 }: { playing: boolean; buffering: boolean; size?: number }) {
  const reduced = reducedMotion();
  if (buffering) return <Spinner size={size} />;
  return (
    <span className="grid place-items-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          className="col-start-1 row-start-1 grid place-items-center"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          transition={reduced ? fade : phoneTween(PHONE_MS.icon)}
        >
          <PhoneIcon icon={playing ? PauseIcon : PlayIcon} size={size} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

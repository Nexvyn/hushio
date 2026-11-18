import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { PULL_TRIGGER_PX } from "../../lib/phoneGestures";
import { DURATION_MS, phoneSmooth, reducedMotion } from "../../lib/motion";

const FULL_TURN = 360;
const PROGRESS_TURN = 270;
const INDICATOR_PX = 36;

export function PullIndicator({ distance, spinning }: { distance: MotionValue<number>; spinning: boolean }) {
  const spin = useMotionValue(0);
  const y = useTransform(distance, (value) => (value - INDICATOR_PX) / 2);
  const opacity = useTransform(distance, [0, PULL_TRIGGER_PX / 2, PULL_TRIGGER_PX], [0, 0.6, 1]);
  const scale = useTransform(distance, [0, PULL_TRIGGER_PX], [0.6, 1]);
  const rotate = useTransform([distance, spin], ([pulled, turned]: number[]) => {
    const share = Math.min(1, Math.max(0, pulled / PULL_TRIGGER_PX));
    return share * PROGRESS_TURN + turned;
  });

  useEffect(() => {
    if (reducedMotion()) return;
    if (spinning) {
      const loop = animate(spin, spin.get() + FULL_TURN, { duration: DURATION_MS.spin / 1000, ease: "linear", repeat: Infinity });
      return () => loop.stop();
    }
    const settle = animate(spin, Math.round(spin.get() / FULL_TURN) * FULL_TURN, phoneSmooth);
    return () => settle.stop();
  }, [spinning, spin]);

  return (
    <motion.div aria-hidden="true" style={{ y, opacity }} className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center will-change-[transform,opacity]">
      <motion.span style={{ scale }} className="grid size-9 place-items-center text-ink-2">
        <motion.span style={{ rotate }} className="grid place-items-center">
          <PhoneIcon icon={ArrowClockwise} />
        </motion.span>
      </motion.span>
    </motion.div>
  );
}

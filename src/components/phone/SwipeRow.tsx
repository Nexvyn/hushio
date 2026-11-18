import type { ReactNode } from "react";
import { motion, useTransform, type MotionValue } from "motion/react";
import { PhoneIcon } from "./PhoneIcon";
import { useSwipeRow, type RowAction } from "./useSwipeRow";
import { ROW_COMMIT_PX } from "../../lib/phoneGestures";

const TONE = {
  accent: "bg-accent text-on-accent",
  danger: "bg-danger text-on-danger",
} as const;

function Reveal({ action, side, x }: { action: RowAction; side: "right" | "left"; x: MotionValue<number> }) {
  const opacity = useTransform(x, (value) => {
    const travel = side === "right" ? value : -value;
    return Math.min(1, Math.max(0, travel / ROW_COMMIT_PX));
  });
  return (
    <motion.div
      aria-hidden="true"
      style={{ opacity }}
      className={`pointer-events-none absolute inset-0 flex items-center gap-2 px-5 text-meta font-semibold ${TONE[action.tone ?? "accent"]} ${
        side === "right" ? "justify-start" : "justify-end"
      }`}
    >
      <PhoneIcon icon={action.icon} />
      <span>{action.label}</span>
    </motion.div>
  );
}

type SwipeRowProps = {
  swipeLeft?: RowAction;
  swipeRight?: RowAction;
  enabled?: boolean;
  children: ReactNode;
};

export function SwipeRow({ swipeLeft, swipeRight, enabled = true, children }: SwipeRowProps) {
  const row = useSwipeRow(swipeLeft, swipeRight, enabled);
  const surface = useTransform(row.x, (value) => (value === 0 ? "rgb(var(--base) / 0)" : "rgb(var(--base) / 1)"));
  return (
    <div data-swipe-row className="relative h-full w-full overflow-hidden">
      {swipeRight && <Reveal action={swipeRight} side="right" x={row.x} />}
      {swipeLeft && <Reveal action={swipeLeft} side="left" x={row.x} />}
      <motion.div style={{ x: row.x, backgroundColor: surface }} className="relative h-full w-full" {...row.handlers}>
        {children}
      </motion.div>
    </div>
  );
}

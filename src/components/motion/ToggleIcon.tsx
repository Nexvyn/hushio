import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion } from "motion/react";
import { HeartBurst } from "./HeartBurst";
import { phoneBouncy, reducedMotion } from "../../lib/motion";
import { toggleKeyframes, type ToggleKind } from "../../lib/toggleMotion";

type ToggleIconProps = {
  kind: ToggleKind;
  state: string;
  badge?: string;
  children: ReactNode;
};

export function ToggleIcon({ kind, state, badge, children }: ToggleIconProps) {
  const reduced = reducedMotion();
  const glyph = useRef<HTMLSpanElement>(null);
  const seen = useRef(state);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    if (kind === "like" && state === "on" && !reduced) setBurst((count) => count + 1);
    const node = glyph.current;
    const plan = toggleKeyframes(kind, state);
    if (reduced || !node || !plan) return;
    const transition = { duration: plan.duration, ease: plan.ease };
    void animate(node, { [plan.prop]: plan.values }, transition);
  }, [kind, state, reduced]);

  return (
    <span className="relative grid place-items-center">
      <span ref={glyph} className="grid place-items-center">
        {children}
      </span>
      {badge && (
        <motion.span
          aria-hidden="true"
          className="absolute -right-1 -top-1 text-[10px] font-bold leading-none text-current"
          initial={reduced ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={phoneBouncy}
        >
          {badge}
        </motion.span>
      )}
      {burst > 0 && !reduced && <HeartBurst key={burst} />}
    </span>
  );
}

export function ActiveDot({ className }: { className: string }) {
  const reduced = reducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      className={className}
      initial={reduced ? false : { scale: 0 }}
      animate={{ scale: 1 }}
      transition={phoneBouncy}
    />
  );
}

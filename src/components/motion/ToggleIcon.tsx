import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion } from "motion/react";
import { fade, reducedMotion } from "../../lib/motion";
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

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    const node = glyph.current;
    const plan = toggleKeyframes(kind, state, reduced);
    if (!node || !plan) return;
    void animate(node, { scale: plan.values }, { duration: plan.duration, ease: plan.ease });
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
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
        >
          {badge}
        </motion.span>
      )}
    </span>
  );
}

export function ActiveDot({ className }: { className: string }) {
  const reduced = reducedMotion();
  return <motion.span aria-hidden="true" className={className} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={fade} />;
}

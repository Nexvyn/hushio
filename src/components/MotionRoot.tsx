import { MotionConfig, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { useSettings } from "../stores/settings";

export function MotionRoot({ children }: { children: ReactNode }) {
  const osReduce = useReducedMotion();
  const reduceAnimation = useSettings((state) => state.reduceAnimation);
  return (
    <MotionConfig reducedMotion={osReduce || reduceAnimation ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}

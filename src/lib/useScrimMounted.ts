import { useState } from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

export function useScrimMounted(shade: MotionValue<number>): boolean {
  const [mounted, setMounted] = useState(() => shade.get() > 0);
  useMotionValueEvent(shade, "change", (value) => setMounted(value > 0));
  return mounted;
}

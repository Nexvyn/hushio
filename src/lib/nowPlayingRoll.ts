import { motionValue } from "motion/react";

export const nowPlayingRoll = motionValue(0);

export const rollHeight = motionValue(typeof window === "undefined" ? 0 : window.innerHeight);

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => rollHeight.set(window.innerHeight));
}

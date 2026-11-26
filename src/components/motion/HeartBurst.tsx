import { motion } from "motion/react";
import { burstVectors } from "../../lib/heartBurst";
import { DURATION_MS, EASE_OUT } from "../../lib/motion";

export function HeartBurst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {burstVectors().map((dot, index) => (
        <motion.span
          key={index}
          className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-accent"
          style={{ marginLeft: -2, marginTop: -2 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: dot.x, y: dot.y, opacity: 0, scale: 1 }}
          transition={{ duration: DURATION_MS.progress / 1000, ease: EASE_OUT }}
        />
      ))}
    </span>
  );
}

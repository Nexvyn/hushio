import { motion } from "motion/react";
import { fade } from "../lib/motion";
import { statsRows } from "../lib/streamStats";
import { useNowStream } from "../stores/nowStream";

export function StatsPanel({ trackId, onArt = false, className = "" }: { trackId: string; onArt?: boolean; className?: string }) {
  const details = useNowStream((state) => (state.trackId === trackId ? state.details : null));
  const labelTone = onArt ? "text-art/[0.55]" : "text-ink-3";
  const valueTone = onArt ? "text-art/[0.85]" : "text-ink-2";
  return (
    <motion.dl
      aria-label="Stream stats"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={fade}
      className={`grid grid-cols-3 gap-x-4 gap-y-2 tabular-nums ${className}`}
    >
      {statsRows(details).map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className={`truncate text-meta leading-4 ${labelTone}`}>{label}</dt>
          <dd className={`truncate text-meta leading-5 ${valueTone}`}>{value}</dd>
        </div>
      ))}
    </motion.dl>
  );
}

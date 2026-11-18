import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MusicNote } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { fade } from "../lib/motion";

export function NowPlayingArtwork({ src, trackId, overlay }: { src: string; trackId: string; overlay?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <div className="now-playing-artwork">
    <AnimatePresence initial={false}>
      <motion.div key={trackId} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
        {src && !failed ? <img loading="lazy" decoding="async" src={src} alt="Album artwork" draggable={false} onError={() => setFailed(true)} className="size-full object-cover" /> : <span className="grid size-full place-items-center bg-art/[0.08] text-art/[0.6]"><Icon icon={MusicNote} /></span>}
        {overlay}
      </motion.div>
    </AnimatePresence>
  </div>;
}

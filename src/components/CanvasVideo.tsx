import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { canvasFade } from "../lib/motion";

type CanvasVideoProps = { src: string; playing: boolean; className?: string };

export function CanvasVideo({ src, playing, className }: CanvasVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!visible) {
      video.pause();
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
      setReady(false);
      return;
    }
    if (playing) void Promise.resolve(video.play()).catch(() => undefined);
    else video.pause();
  }, [playing, visible, src]);

  if (failed) return null;

  return (
    <motion.video
      ref={ref}
      src={visible ? src : undefined}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setReady(true)}
      onError={() => setFailed(true)}
      className={className}
      initial={false}
      animate={{ opacity: ready ? 1 : 0 }}
      transition={canvasFade}
    />
  );
}

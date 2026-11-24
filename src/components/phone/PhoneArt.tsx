import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { MusicNote } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { EASE_OUT, MS_FADE, MS_IMAGE, SPRING_GESTURE, reducedMotion } from "../../lib/motion";

type PhoneArtProps = {
  src: string | null;
  round?: boolean;
  radius?: string;
  className?: string;
  children?: ReactNode;
  layoutId?: string;
};

const loadedArt = new Set<string>();

export function PhoneArt({ src, round = false, radius = "rounded-[12px]", className = "block aspect-square w-full", children, layoutId }: PhoneArtProps) {
  const shape = round ? "rounded-full" : `${radius} [corner-shape:squircle]`;
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(null);
  const state = settled?.src === src ? settled : null;
  const loaded = (src !== null && loadedArt.has(src)) || state?.ok === true;
  const failed = state?.ok === false;
  const reduced = reducedMotion();
  return (
    <span aria-hidden="true" className={`${className} relative overflow-hidden bg-wash text-ink-2 ${shape}`}>
      {(!src || failed) && (
        <span className="absolute inset-0 grid place-items-center">
          <PhoneIcon icon={MusicNote} />
        </span>
      )}
      {src && !failed && (
        <motion.img
          src={src}
          layoutId={reduced ? undefined : layoutId}
          initial={false}
          animate={{ opacity: loaded ? 1 : 0 }}
          transition={reduced ? { duration: MS_FADE / 1000, ease: EASE_OUT } : { duration: MS_IMAGE / 1000, ease: EASE_OUT, layout: SPRING_GESTURE }}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => {
            loadedArt.add(src);
            setSettled({ src, ok: true });
          }}
          onError={() => setSettled({ src, ok: false })}
          className={`absolute inset-0 size-full object-cover ${shape}`}
        />
      )}
      {children}
    </span>
  );
}

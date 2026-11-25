import { useCallback, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { MusicNote } from "@phosphor-icons/react";
import { PhoneIcon } from "./PhoneIcon";
import { EASE_OUT, MS_FADE, MS_IMAGE, SPRING_GESTURE, reducedMotion } from "../../lib/motion";
import { artFitFor, type ArtFit } from "../../lib/artFit";

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
  const [fit, setFit] = useState<ArtFit>("cover");
  const state = settled?.src === src ? settled : null;
  const loaded = (src !== null && loadedArt.has(src)) || state?.ok === true;
  const failed = state?.ok === false;
  const reduced = reducedMotion();
  const attach = useCallback(
    (image: HTMLImageElement | null) => {
      if (!src || !image?.complete || image.naturalWidth === 0) return;
      loadedArt.add(src);
      setFit(artFitFor(image));
      setSettled({ src, ok: true });
    },
    [src],
  );
  return (
    <span aria-hidden="true" className={`${className} relative overflow-hidden text-ink-2 ${shape} ${fit === "contain" ? "bg-base" : "bg-wash"}`}>
      {(!src || failed) && (
        <span className="absolute inset-0 grid place-items-center">
          <PhoneIcon icon={MusicNote} />
        </span>
      )}
      {src && !failed && (
        <motion.img
          ref={attach}
          src={src}
          layoutId={reduced ? undefined : layoutId}
          initial={false}
          animate={{ opacity: loaded ? 1 : 0 }}
          transition={reduced ? { duration: MS_FADE / 1000, ease: EASE_OUT } : { duration: MS_IMAGE / 1000, ease: EASE_OUT, layout: SPRING_GESTURE }}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={(event) => attach(event.currentTarget)}
          onError={() => setSettled({ src, ok: false })}
          className={`absolute inset-0 size-full ${fit === "contain" ? "object-contain" : "object-cover"} ${shape}`}
        />
      )}
      {children}
    </span>
  );
}

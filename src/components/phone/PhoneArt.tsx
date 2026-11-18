import { useState, type ReactNode } from "react";
import { MusicNote } from "@phosphor-icons/react";
import { Icon } from "../Icon";

type PhoneArtProps = {
  src: string | null;
  round?: boolean;
  radius?: string;
  className?: string;
  children?: ReactNode;
};

const loadedArt = new Set<string>();

export function PhoneArt({ src, round = false, radius = "rounded-[12px]", className = "block aspect-square w-full", children }: PhoneArtProps) {
  const shape = round ? "rounded-full" : `${radius} [corner-shape:squircle]`;
  const [settled, setSettled] = useState<{ src: string; ok: boolean } | null>(null);
  const state = settled?.src === src ? settled : null;
  const loaded = (src !== null && loadedArt.has(src)) || state?.ok === true;
  const failed = state?.ok === false;
  return (
    <span aria-hidden="true" className={`${className} relative overflow-hidden bg-wash text-ink-2 ${shape}`}>
      <span className="absolute inset-0 grid place-items-center">
        <Icon icon={MusicNote} />
      </span>
      {src && !failed && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => {
            loadedArt.add(src);
            setSettled({ src, ok: true });
          }}
          onError={() => setSettled({ src, ok: false })}
          className={`absolute inset-0 size-full object-cover ${shape} motion-safe:transition-opacity motion-safe:duration-reading ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {children}
    </span>
  );
}

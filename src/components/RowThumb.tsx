import { useState } from "react";
import { MusicNote } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { thumbArtwork } from "../lib/artwork";
import { useInk } from "../lib/onArt";

export function RowThumb({ src, size = 48 }: { src: string | null | undefined; size?: number }) {
  const ink = useInk();
  const [settled, setSettled] = useState<{ url: string; ok: boolean } | null>(null);
  const url = src ? thumbArtwork(src, size) : "";
  const state = settled?.url === url ? settled : null;
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[9px] ${ink.tint} ${ink.secondary}`}
      style={{ width: size, height: size }}
    >
      {(!url || state?.ok === false) && <Icon icon={MusicNote} />}
      {url && state?.ok !== false && (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setSettled({ url, ok: true })}
          onError={() => setSettled({ url, ok: false })}
          className={`absolute inset-0 h-full w-full object-cover motion-safe:transition-opacity motion-safe:duration-reading ${state?.ok ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </span>
  );
}

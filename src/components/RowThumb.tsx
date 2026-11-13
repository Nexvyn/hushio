import { useState } from "react";
import { MusicNote01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { thumbArtwork } from "../lib/artwork";
import { useInk } from "../lib/onArt";
import { usePhone } from "../lib/usePhone";

export function RowThumb({ src, size = 48 }: { src: string | null | undefined; size?: number }) {
  const ink = useInk();
  const phone = usePhone();
  const [settled, setSettled] = useState<{ url: string; ok: boolean } | null>(null);
  const url = src ? thumbArtwork(src, size) : "";
  const frame = `grid shrink-0 place-items-center overflow-hidden rounded-[9px] ${ink.tint} ${ink.secondary}`;
  if (!phone) {
    return (
      <span className={frame} style={{ width: size, height: size }}>
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <Icon icon={MusicNote01Icon} />
        )}
      </span>
    );
  }
  const state = settled?.url === url ? settled : null;
  return (
    <span className={`relative ${frame}`} style={{ width: size, height: size }}>
      <Icon icon={MusicNote01Icon} />
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

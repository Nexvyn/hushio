import { useState } from "react";
import { Play } from "@phosphor-icons/react";
import { Icon } from "./Icon";

const cover = "outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10";

export function Cover({ src, round = false }: { src: string | null; round?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const shape = round ? "rounded-full" : "rounded-art";
  if (!src || src === failedSrc) return <span aria-hidden="true" className={`block aspect-square w-full ${shape} bg-wash`} />;
  return (
    <img
      ref={(node) => {
        if (node?.complete && node.naturalWidth > 0) setLoadedSrc(src);
      }}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      data-loaded={loadedSrc === src ? "" : undefined}
      onLoad={() => setLoadedSrc(src)}
      onError={() => setFailedSrc(src)}
      className={`block aspect-square w-full ${shape} object-cover ${cover} opacity-0 transition-opacity duration-reveal data-[loaded]:opacity-100`}
    />
  );
}

export function CoverPlay() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-panel text-ink-1 opacity-0 shadow-float motion-safe:transition-[opacity,transform] motion-safe:duration-hover scale-75 group-hover:scale-100 group-focus-visible:scale-100 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:hidden"
    >
      <Icon icon={Play} />
    </span>
  );
}

export function CoverArt({ src, round = false }: { src: string | null; round?: boolean }) {
  return (
    <span className="relative block">
      <Cover src={src} round={round} />
      {!round && <CoverPlay />}
    </span>
  );
}

export function CoverCardLabel({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <span className="mt-2 block w-full min-w-0">
      <span className="block truncate text-body font-semibold text-ink-1">{title}</span>
      {subtitle && <span className="block truncate text-meta text-ink-2">{subtitle}</span>}
    </span>
  );
}

export const coverCardClass = "group block min-w-0 shrink-0 rounded-art text-left bt-press";

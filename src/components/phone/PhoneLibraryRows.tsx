import { useState, type ReactNode } from "react";
import { CaretRight, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { thumbArtwork } from "../../lib/artwork";
import type { Point } from "../../lib/touchGesture";
import { PhoneIcon } from "./PhoneIcon";
import { PressRow } from "./PressRow";

function CoverImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      decoding="async"
      src={src}
      alt=""
      loading="lazy"
      onLoad={() => setLoaded(true)}
      className={`size-full object-cover motion-safe:transition-opacity motion-safe:duration-reading ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}

const TILE_PIXELS = 120;

type PhoneCollageProps = {
  covers: string[];
  fallback: PhosphorIcon;
  sizeClass: string;
  radiusClass: string;
};

export function PhoneCollage({ covers, fallback, sizeClass, radiusClass }: PhoneCollageProps) {
  const urls = covers
    .map((cover) => thumbArtwork(cover, TILE_PIXELS))
    .filter((url) => url !== "")
    .slice(0, 4);
  const shape = `${sizeClass} relative shrink-0 overflow-hidden bg-elevated text-ink-1 ${radiusClass} [corner-shape:squircle]`;
  if (urls.length === 0) {
    return (
      <span aria-hidden="true" className={`${shape} grid place-items-center`}>
        <PhoneIcon icon={fallback} />
      </span>
    );
  }
  if (urls.length < 4) {
    return (
      <span aria-hidden="true" className={shape}>
        <CoverImage key={urls[0]} src={urls[0]} />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${shape} grid grid-cols-2 grid-rows-2`}>
      {urls.map((url) => (
        <CoverImage key={url} src={url} />
      ))}
    </span>
  );
}

type PhoneLibraryRowProps = {
  title: string;
  subtitle: string;
  art: ReactNode;
  onOpen: () => void;
  onLongPress?: (point: Point) => void;
};

export function PhoneLibraryRow({ title, subtitle, art, onOpen, onLongPress }: PhoneLibraryRowProps) {
  return (
    <PressRow label={title} className="h-16" contentClassName="gap-3" onPress={onOpen} onLongPress={onLongPress}>
      {art}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body leading-[22px] text-ink-1">{title}</span>
        <span className="block truncate text-meta leading-[18px] tabular-nums text-ink-2">{subtitle}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-ink-2">
        <PhoneIcon icon={CaretRight} />
      </span>
    </PressRow>
  );
}




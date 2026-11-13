import type { ReactNode } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import { focusRing } from "../HomeShelves";
import { thumbArtwork } from "../../lib/artwork";
import type { Point } from "../../lib/touchGesture";
import { PhoneIcon } from "./PhoneIcon";
import { PressRow } from "./PressRow";

const TILE_PIXELS = 120;

type PhoneCollageProps = {
  covers: string[];
  fallback: IconSvgElement;
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
        <img src={urls[0]} alt="" loading="lazy" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={`${shape} grid grid-cols-2 grid-rows-2`}>
      {urls.map((url) => (
        <img key={url} src={url} alt="" loading="lazy" className="size-full object-cover" />
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
        <span className="block truncate text-[16px] leading-[22px] text-ink-1">{title}</span>
        <span className="block truncate text-[13.5px] leading-[18px] tabular-nums text-ink-2">{subtitle}</span>
      </span>
    </PressRow>
  );
}

type PhoneLibraryCardProps = {
  title: string;
  subtitle: string;
  covers: string[];
  fallback: IconSvgElement;
  onOpen: () => void;
};

export function PhoneLibraryCard({ title, subtitle, covers, fallback, onOpen }: PhoneLibraryCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-[140px] shrink-0 snap-start flex-col rounded-[12px] text-left motion-safe:transition-opacity active:opacity-70 ${focusRing}`}
    >
      <PhoneCollage covers={covers} fallback={fallback} sizeClass="size-[140px]" radiusClass="rounded-[12px]" />
      <span className="mt-2 block truncate text-[14px] leading-[18px] font-medium text-ink-1">{title}</span>
      <span className="block truncate text-[13px] leading-[17px] text-ink-2">{subtitle}</span>
    </button>
  );
}

import type { ReactNode } from "react";
import { focusRing } from "../HomeShelves";
import { thumbArtwork } from "../../lib/artwork";
import { openRecentItem } from "../../lib/searchActions";
import type { RecentItem } from "../../stores/recents";
import { PhoneArt } from "./PhoneArt";

export type ShelfVariant = "tile" | "large" | "round" | "compact" | "default";

const ART_SIZE: Record<ShelfVariant, number> = { tile: 116, large: 164, round: 104, compact: 56, default: 148 };

const FRAME: Record<ShelfVariant, string> = {
  default: "w-[148px] flex-col items-stretch",
  tile: "w-[116px] flex-col items-stretch",
  large: "w-[164px] flex-col items-stretch",
  round: "w-[104px] flex-col items-center text-center",
  compact: "w-[280px] flex-row items-center gap-3",
};

const TITLE: Record<ShelfVariant, string> = {
  default: "text-[14px] leading-[18px] font-medium",
  tile: "text-[14px] leading-[18px] font-medium",
  large: "text-[15px] leading-5 font-medium",
  round: "text-[14px] leading-[18px] font-medium",
  compact: "text-[16px] leading-[22px] font-normal",
};

const ROW: Record<ShelfVariant, string> = {
  default: "flex items-start gap-3",
  tile: "flex items-start gap-3",
  large: "flex items-start gap-3",
  round: "flex items-start gap-3",
  compact: "grid grid-flow-col grid-rows-2 auto-cols-[280px] items-start gap-3",
};

export function PhoneSectionHeader({ id, title }: { id?: string; title: string }) {
  return (
    <h2 id={id} className="mb-3 truncate font-title text-[20px] leading-[26px] font-bold tracking-[-0.02em] text-ink-1">
      {title}
    </h2>
  );
}

export function PhoneShelfRow({ children, variant = "default" }: { children: ReactNode; variant?: ShelfVariant }) {
  return (
    <div
      className={`no-scrollbar -mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto px-4 pb-1 ${ROW[variant]}`}
    >
      {children}
    </div>
  );
}

export function PhoneShelfArt({ src, variant = "default", round = false }: { src: string | null; variant?: ShelfVariant; round?: boolean }) {
  const compact = variant === "compact";
  return (
    <PhoneArt
      src={thumbArtwork(src, ART_SIZE[variant]) || null}
      round={round}
      radius={compact ? "rounded-[6px]" : "rounded-[10px]"}
      className={compact ? "block size-14 shrink-0" : "block aspect-square w-full"}
    />
  );
}

type PhoneShelfCardProps = {
  art: ReactNode;
  title: string;
  subtitle?: string;
  tag?: string;
  round?: boolean;
  variant?: ShelfVariant;
  onActivate: () => void;
};

export function PhoneShelfCard({ art, title, subtitle, tag, round = false, variant = "default", onActivate }: PhoneShelfCardProps) {
  const row = variant === "compact";
  const showSubtitle = subtitle && variant !== "tile" && variant !== "round";
  return (
    <button
      type="button"
      onClick={onActivate}
      className={`flex shrink-0 snap-start rounded-[10px] text-left motion-safe:transition-opacity active:opacity-70 ${FRAME[variant]} ${round ? "text-center" : ""} ${focusRing}`}
    >
      <span className={`relative block ${row ? "size-14 shrink-0" : "w-full"}`}>
        {art}
        {tag && (
          <span className="absolute left-1.5 top-1.5 rounded-[6px] bg-panel px-1.5 py-0.5 text-[12px] font-semibold tracking-[0.08em] text-ink-1">
            {tag}
          </span>
        )}
      </span>
      <span className={`block min-w-0 ${row ? "flex-1" : "mt-2"}`}>
        <span className={`block truncate text-ink-1 ${TITLE[variant]}`}>{title}</span>
        {showSubtitle && (
          <span className={row ? "block truncate text-[13.5px] leading-[18px] text-ink-2" : "line-clamp-2 text-[13px] leading-[17px] text-ink-2"}>
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}

export function PhoneQuickTiles({ items }: { items: RecentItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <button
          type="button"
          key={`${item.kind}-${item.id}`}
          onClick={() => openRecentItem(item)}
          className={`flex h-14 min-w-0 items-center overflow-hidden rounded-[10px] bg-elevated text-left motion-safe:transition-colors active:bg-pressed ${focusRing}`}
        >
          <PhoneArt src={thumbArtwork(item.thumb, 56) || null} radius="rounded-none" className="block size-14 shrink-0" />
          <span className="line-clamp-2 min-w-0 flex-1 px-2.5 text-[14px] leading-[18px] font-medium text-ink-1">{item.title}</span>
        </button>
      ))}
    </div>
  );
}

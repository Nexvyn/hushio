import type { ReactNode } from "react";
import { motion } from "motion/react";
import { focusRing } from "../HomeShelves";
import type { MenuSource } from "../ContextMenu";
import { thumbArtwork } from "../../lib/artwork";
import { phoneSmooth, pressTap, reducedMotion } from "../../lib/motion";
import { openRecentItem } from "../../lib/searchActions";
import type { RecentItem } from "../../stores/recents";
import { PhoneArt } from "./PhoneArt";
import { menuAt, useCardLongPress } from "./useCardLongPress";

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
  default: "text-phone-row-title",
  tile: "text-phone-row-title",
  large: "text-phone-row-title",
  round: "text-phone-row-title",
  compact: "text-phone-row-title",
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
    <h2 id={id} className="mb-3 truncate font-title text-phone-section text-ink-1">
      {title}
    </h2>
  );
}

export function PhoneShelfRow({ children, variant = "default" }: { children: ReactNode; variant?: ShelfVariant }) {
  return (
    <div
      data-hscroll
      className={`no-scrollbar -mr-4 snap-x snap-proximity overflow-x-auto pr-4 pb-1 ${ROW[variant]}`}
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
      radius="rounded-art"
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
  menu?: MenuSource;
  onActivate: () => void;
};

export function PhoneShelfCard({ art, title, subtitle, tag, round = false, variant = "default", menu, onActivate }: PhoneShelfCardProps) {
  const row = variant === "compact";
  const showSubtitle = subtitle && variant !== "tile" && variant !== "round";
  const reduced = reducedMotion();
  const hold = useCardLongPress(menuAt(menu));
  return (
    <motion.button
      type="button"
      onClick={() => {
        if (!hold.consumeHold()) onActivate();
      }}
      {...hold.bind}
      whileTap={pressTap(reduced)}
      transition={phoneSmooth}
      className={`flex shrink-0 snap-start rounded-art text-left ${FRAME[variant]} ${round ? "text-center" : ""} ${focusRing}`}
    >
      <span className={`relative block ${row ? "size-14 shrink-0" : "w-full"}`}>
        {art}
        {tag && (
          <span className="absolute left-1.5 top-1.5 rounded-[6px] bg-panel px-1.5 py-0.5 text-phone-utility text-ink-1">
            {tag}
          </span>
        )}
      </span>
      <span className={`block min-w-0 ${row ? "flex-1" : "mt-2"}`}>
        <span className={`block truncate text-ink-1 ${TITLE[variant]}`}>{title}</span>
        {showSubtitle && (
          <span className="block truncate text-phone-meta text-ink-2">
            {subtitle}
          </span>
        )}
      </span>
    </motion.button>
  );
}

type QuickTileProps = { item: RecentItem; menu?: MenuSource };

function QuickTile({ item, menu }: QuickTileProps) {
  const reduced = reducedMotion();
  const hold = useCardLongPress(menuAt(menu));
  return (
    <motion.button
      type="button"
      onClick={() => {
        if (!hold.consumeHold()) openRecentItem(item);
      }}
      {...hold.bind}
      whileTap={pressTap(reduced)}
      transition={phoneSmooth}
      className={`flex h-14 min-w-0 items-center overflow-hidden rounded-[10px] bg-elevated text-left ${focusRing}`}
    >
      <PhoneArt src={thumbArtwork(item.thumb, 56) || null} radius="rounded-none" className="block size-14 shrink-0" />
      <span className="line-clamp-2 min-w-0 flex-1 px-2.5 text-phone-row-title text-ink-1">{item.title}</span>
    </motion.button>
  );
}

export function PhoneQuickTiles({ items, menuFor }: { items: RecentItem[]; menuFor?: (item: RecentItem) => MenuSource | undefined }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <QuickTile key={`${item.kind}-${item.id}`} item={item} menu={menuFor?.(item)} />
      ))}
    </div>
  );
}

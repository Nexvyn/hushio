import { useId, useRef } from "react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { browseMenuItems } from "../lib/browseActions";
import { songOf, trackMenuItems } from "../lib/trackActions";
import { playFromRow } from "../stores/player";
import type { MenuItem } from "../stores/ui";
import { useNavigation } from "../stores/navigation";
import { openRecentItem } from "../lib/searchActions";
import type { HomeItem, HomeShelf } from "../lib/home";
import type { RecentItem } from "../stores/recents";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-base";
const cover = "outline outline-1 -outline-offset-1 outline-black/10 [[data-theme=dark]_&]:outline-white/10";

function reducedMotion(): boolean {
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

export function Cover({ src, round = false }: { src: string | null; round?: boolean }) {
  const shape = round ? "rounded-full" : "rounded-[9px]";
  if (!src) return <span aria-hidden="true" className={`block aspect-square w-full ${shape} bg-wash`} />;
  return <img src={src} alt="" loading="lazy" className={`block aspect-square w-full ${shape} object-cover ${cover}`} />;
}

function CardLabel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="mt-2 block min-w-0 px-0.5">
      <span className="block truncate text-[13px] font-medium text-ink-1">{title}</span>
      {subtitle && <span className="block truncate text-[12px] text-ink-2">{subtitle}</span>}
    </span>
  );
}

function shelfMenu(item: HomeItem): MenuItem[] {
  switch (item.kind) {
    case "track":
      return trackMenuItems(songOf(item.track));
    case "album":
      return browseMenuItems({ type: "album", browseId: item.id, title: item.title, subtitle: item.artist, thumb: item.thumb });
    case "artist":
      return browseMenuItems({ type: "artist", browseId: item.id, title: item.name, subtitle: "", thumb: item.thumb });
    case "playlist":
      return browseMenuItems({ type: "playlist", browseId: item.id, title: item.title, subtitle: item.subtitle, thumb: item.thumb });
  }
}

function ShelfCard({ item }: { item: HomeItem }) {
  const menu = () => shelfMenu(item);
  return (
    <div
      className="contents"
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => void openMenuFromKey(event, menu)}
    >
      <ShelfButton item={item} />
    </div>
  );
}

function ShelfButton({ item }: { item: HomeItem }) {
  const navigate = useNavigation((state) => state.navigate);
  const cardClass = `w-[160px] shrink-0 rounded-[11px] p-1 text-left motion-safe:transition-colors hover:bg-wash active:bg-pressed ${focusRing}`;
  switch (item.kind) {
    case "track":
      return (
        <button type="button" className={cardClass} onClick={() => playFromRow([item.track], 0)}>
          <Cover src={item.track.thumb} />
          <CardLabel title={item.track.title} subtitle={item.track.artist} />
        </button>
      );
    case "album":
      return (
        <button type="button" className={cardClass} onClick={() => navigate({ name: "album", param: item.id })}>
          <Cover src={item.thumb} />
          <CardLabel title={item.title} subtitle={item.artist} />
        </button>
      );
    case "artist":
      return (
        <button type="button" className={`${cardClass} text-center`} onClick={() => navigate({ name: "artist", param: item.id })}>
          <Cover src={item.thumb} round />
          <CardLabel title={item.name} subtitle="" />
        </button>
      );
    case "playlist":
      return (
        <button type="button" className={cardClass} onClick={() => navigate({ name: "ytplaylist", param: item.id })}>
          <Cover src={item.thumb} />
          <CardLabel title={item.title} subtitle={item.subtitle} />
        </button>
      );
  }
}

const arrowClass = `absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-panel text-ink-1 opacity-0 shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_4px_10px_-4px_rgb(0_0_0/0.12)] motion-safe:transition-opacity hover:bg-hover focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:hidden ${focusRing}`;

export function HomeShelfView({ shelf }: { shelf: HomeShelf }) {
  const titleId = useId();
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 1 | -1) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <section aria-labelledby={titleId}>
      <h2 id={titleId} className="mb-3 text-[20px] font-bold tracking-[-0.01em] text-ink-1">
        {shelf.title}
      </h2>
      <div className="group relative">
        <button type="button" aria-label="Scroll left" className={`${arrowClass} left-1`} onClick={() => scrollBy(-1)}>
          <Icon icon={ArrowLeft01Icon} />
        </button>
        <div
          ref={scroller}
          className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] motion-safe:scroll-smooth [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ink-1/20"
        >
          {shelf.items.map((item, index) => (
            <ShelfCard key={`${item.kind}-${index}`} item={item} />
          ))}
        </div>
        <button type="button" aria-label="Scroll right" className={`${arrowClass} right-1`} onClick={() => scrollBy(1)}>
          <Icon icon={ArrowRight01Icon} />
        </button>
      </div>
    </section>
  );
}

export function QuickTiles({ items }: { items: RecentItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {items.map((item) => (
        <button
          type="button"
          key={`${item.kind}-${item.id}`}
          onClick={() => openRecentItem(item)}
          className={`flex min-h-14 min-w-0 items-center gap-3 overflow-hidden rounded-[10px] bg-wash pr-3 text-left motion-safe:transition-colors hover:bg-hover active:bg-pressed ${focusRing}`}
        >
          <span className="h-14 w-14 shrink-0">
            <Cover src={item.thumb} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink-1">{item.title}</span>
            <span className="block truncate text-[12px] text-ink-2">{item.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

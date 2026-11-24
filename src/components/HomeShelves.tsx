import { useId, useRef, useState } from "react";
import { CaretLeft, CaretRight, Play } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { Cover, CoverArt, CoverCardLabel, coverCardClass } from "./CoverCard";

export { Cover };
import { SectionHeader } from "./SectionHeader";
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
function reducedMotion(): boolean {
  return (
    document.documentElement.classList.contains("reduce-motion") ||
    (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false)
  );
}

export function shelfMenu(item: HomeItem): MenuItem[] {
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
  const cardClass = `w-[160px] ${coverCardClass} ${focusRing}`;
  switch (item.kind) {
    case "track":
      return (
        <button type="button" className={cardClass} onClick={() => playFromRow([item.track], 0)}>
          <CoverArt src={item.track.thumb} />
          <CoverCardLabel title={item.track.title} subtitle={item.track.artist} />
        </button>
      );
    case "album":
      return (
        <button type="button" className={cardClass} onClick={() => navigate({ name: "album", param: item.id })}>
          <CoverArt src={item.thumb} />
          <CoverCardLabel title={item.title} subtitle={item.artist} />
        </button>
      );
    case "artist":
      return (
        <button type="button" className={`${cardClass} text-center`} onClick={() => navigate({ name: "artist", param: item.id })}>
          <CoverArt src={item.thumb} round />
          <CoverCardLabel title={item.name} />
        </button>
      );
    case "playlist":
      return (
        <button type="button" className={cardClass} onClick={() => navigate({ name: "ytplaylist", param: item.id })}>
          <CoverArt src={item.thumb} />
          <CoverCardLabel title={item.title} subtitle={item.subtitle} />
        </button>
      );
  }
}

const arrowClass = `absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-panel text-ink-1 opacity-0 shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_4px_10px_-4px_rgb(0_0_0/0.12)] motion-safe:transition-opacity hover:bg-hover focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:hidden ${focusRing}`;

export function HomeShelfView({ shelf, seeAll }: { shelf: HomeShelf; seeAll?: { label: string; onClick: () => void } }) {
  const titleId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const scrollBy = (direction: 1 | -1) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({
      left: direction * element.clientWidth * 0.8,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <section aria-labelledby={titleId} className="bt-scroll-reveal">
      <SectionHeader
        id={titleId}
        title={shelf.title}
        action={
          seeAll ?? (shelf.items.length > 0 ? { label: expanded ? "Show less" : "Show all", onClick: () => setExpanded((value) => !value) } : undefined)
        }
      />
      {expanded ? (
        <div className="flex flex-wrap items-start gap-4 pb-3">
          {shelf.items.map((item, index) => (
            <ShelfCard key={`${item.kind}-${index}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="group relative">
          <button type="button" aria-label="Scroll left" className={`${arrowClass} left-1`} onClick={() => scrollBy(-1)}>
            <Icon icon={CaretLeft} />
          </button>
          <div
            ref={scroller}
            className="no-scrollbar shelf-row flex items-start gap-3 overflow-x-auto pb-3 motion-safe:scroll-smooth"
          >
            {shelf.items.map((item, index) => (
              <ShelfCard key={`${item.kind}-${index}`} item={item} />
            ))}
          </div>
          <button type="button" aria-label="Scroll right" className={`${arrowClass} right-1`} onClick={() => scrollBy(1)}>
            <Icon icon={CaretRight} />
          </button>
        </div>
      )}
    </section>
  );
}

export function QuickTiles({ items }: { items: RecentItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4 xl:grid-cols-3">
      {items.map((item) => (
        <button
          type="button"
          key={`${item.kind}-${item.id}`}
          onClick={() => openRecentItem(item)}
          className={`group flex h-14 min-w-0 items-center gap-3 overflow-hidden rounded-[8px] bg-wash pr-2 text-left motion-safe:transition-colors hover:bg-hover active:bg-pressed ${focusRing}`}
        >
          <span className="h-14 w-14 shrink-0">
            <Cover src={item.thumb} />
          </span>
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink-1">{item.title}</span>
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-panel text-ink-1 opacity-0 shadow-float motion-safe:transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:hidden"
          >
            <Icon icon={Play} />
          </span>
        </button>
      ))}
    </div>
  );
}

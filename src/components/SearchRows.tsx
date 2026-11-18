import { PhoneArt } from "./phone/PhoneArt";
import { CoverArt, CoverCardLabel, coverCardClass } from "./CoverCard";
import { focusRing } from "./HomeShelves";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { browseMenuItems } from "../lib/browseActions";
import { openBrowse } from "../lib/searchActions";
import type { BrowseItem, BrowseType } from "../lib/searchParse";
import { joinSubtitle } from "../lib/subtitle";
import { usePhone } from "../lib/usePhone";
import { useImageReveal } from "./useImageReveal";

export const TYPE_LABEL: Record<BrowseType, string> = {
  album: "Album",
  artist: "Artist",
  playlist: "Playlist",
  other: "",
};

const rowClass =
  "flex h-14 min-w-0 flex-1 items-center gap-3 rounded-[10px] py-1 pl-2 pr-2 text-left transition-colors hover:bg-wash active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function Artwork({
  src,
  round = false,
  size = "h-10 w-10",
  radius,
}: {
  src: string | null;
  round?: boolean;
  size?: string;
  radius?: string;
}) {
  const phone = usePhone();
  const reveal = useImageReveal(src);
  if (phone) {
    return <PhoneArt src={src} round={round} radius={radius ?? "rounded-md"} className={`block shrink-0 ${size}`} />;
  }
  const shape = radius ?? (round ? "rounded-full" : "rounded-md");
  if (!src) return <span aria-hidden="true" className={`${size} ${shape} shrink-0 bg-wash`} />;
  return <img src={src} alt="" loading="lazy" decoding="async" onLoad={reveal.onLoad} className={`${size} ${shape} shrink-0 object-cover ${reveal.className}`} />;
}

export function BrowseCard({ item, query }: { item: BrowseItem; query: string }) {
  const artist = item.type === "artist";
  const menu = () => browseMenuItems(item);
  return (
    <button
      type="button"
      onClick={() => openBrowse(item, query)}
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => void openMenuFromKey(event, menu)}
      className={`${coverCardClass} ${focusRing} w-full ${artist ? "text-center" : ""}`}
    >
      <CoverArt src={item.thumb} round={artist} />
      <CoverCardLabel title={item.title} subtitle={joinSubtitle(TYPE_LABEL[item.type], item.subtitle)} />
    </button>
  );
}

export function BrowseRow({ item, query }: { item: BrowseItem; query: string }) {
  const label = TYPE_LABEL[item.type];
  const subtitle = joinSubtitle(label, item.subtitle);
  const menu = () => browseMenuItems(item);
  return (
    <button
      type="button"
      onClick={() => openBrowse(item, query)}
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => void openMenuFromKey(event, menu)}
      className={`${rowClass} w-full`}
    >
      <Artwork src={item.thumb} round={item.type === "artist"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-ink-1">{item.title}</span>
        <span className="block truncate text-meta text-ink-2">{subtitle}</span>
      </span>
    </button>
  );
}

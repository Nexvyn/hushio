import { ListStartIcon, PlayListAddIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Icon } from "./Icon";
import { browseMenuItems } from "../lib/browseActions";
import { fmtTime } from "../lib/format";
import { openBrowse, playSong } from "../lib/searchActions";
import type { BrowseItem, BrowseType, SearchSong } from "../lib/searchParse";
import { trackMenuItems } from "../lib/trackActions";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export const TYPE_LABEL: Record<BrowseType, string> = {
  album: "Album",
  artist: "Artist",
  playlist: "Playlist",
  podcast: "Podcast",
  other: "More",
};

const rowClass =
  "flex min-w-0 flex-1 items-center gap-3 rounded-[10px] px-2 py-1.5 text-left transition-colors hover:bg-wash active:bg-pressed";
const iconClass =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-wash hover:text-ink-1 active:bg-pressed";

export function Artwork({ src, round = false, size = "h-10 w-10" }: { src: string | null; round?: boolean; size?: string }) {
  const shape = round ? "rounded-full" : "rounded-md";
  if (!src) return <span aria-hidden="true" className={`${size} ${shape} shrink-0 bg-wash`} />;
  return <img src={src} alt="" loading="lazy" className={`${size} ${shape} shrink-0 object-cover`} />;
}

export function SongRow({ song, query }: { song: SearchSong; query: string }) {
  const addToQueue = usePlayer((state) => state.addToQueue);
  const toast = useUI((state) => state.toast);
  const menu = () => trackMenuItems(song);
  return (
    <div
      className="group flex items-center gap-1 rounded-[10px] pr-1 hover:bg-wash/60"
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => void openMenuFromKey(event, menu)}
    >
      <button type="button" onClick={() => playSong(song, query)} className={rowClass}>
        <Artwork src={song.thumb} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink-1">{song.title}</span>
          <span className="block truncate text-[12px] text-ink-2">{song.artist}</span>
        </span>
        {song.duration > 0 && (
          <span className="shrink-0 text-[12px] tabular-nums text-ink-2">{fmtTime(song.duration)}</span>
        )}
      </button>
      <button
        type="button"
        title="Play next"
        aria-label={`Play "${song.title}" next`}
        className={iconClass}
        onClick={() => {
          addToQueue([song], true);
          toast(`"${song.title}" plays next`);
        }}
      >
        <Icon icon={ListStartIcon} />
      </button>
      <button
        type="button"
        title="Add to queue"
        aria-label={`Add "${song.title}" to queue`}
        className={iconClass}
        onClick={() => {
          const added = addToQueue([song]);
          toast(added > 0 ? "Added to queue" : "Already in your queue");
        }}
      >
        <Icon icon={PlayListAddIcon} />
      </button>
      <ActionMenu items={menu} label={`More options for ${song.title}`} />
    </div>
  );
}

export function BrowseRow({ item, query }: { item: BrowseItem; query: string }) {
  const subtitle = item.subtitle ? `${TYPE_LABEL[item.type]} • ${item.subtitle}` : TYPE_LABEL[item.type];
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
        <span className="block truncate text-[13px] font-medium text-ink-1">{item.title}</span>
        <span className="block truncate text-[12px] text-ink-2">{subtitle}</span>
      </span>
    </button>
  );
}

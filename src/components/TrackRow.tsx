import { PlayIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { EqBars } from "./EqBars";
import { ExplicitBadge } from "./ExplicitBadge";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { type MenuSource, openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Artwork } from "./SearchRows";
import { fmtTime } from "../lib/format";
import type { SearchSong } from "../lib/searchParse";
import type { SortableRowProps } from "../lib/useSortable";

type TrackRowProps = {
  index: number;
  song: SearchSong;
  current: boolean;
  playing: boolean;
  menu: MenuSource;
  onPlay: () => void;
  artwork?: boolean;
  showAlbum?: boolean;
  dividerInset?: string;
  rowProps?: SortableRowProps;
};

export function TrackRow({
  index,
  song,
  current,
  playing,
  menu,
  onPlay,
  artwork = false,
  showAlbum = false,
  dividerInset = "after:left-[112px]",
  rowProps,
}: TrackRowProps) {
  return (
    <li
      {...rowProps}
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => {
        if (!openMenuFromKey(event, menu)) rowProps?.onKeyDown(event);
      }}
      className={`group relative isolate flex h-16 items-center gap-1 rounded-[10px] pr-2 motion-safe:transition-colors after:absolute after:bottom-0 after:right-3 after:h-px after:bg-card-edge/[0.06] last:after:hidden ${dividerInset} ${current ? "bg-hover" : "[@media(hover:hover)]:hover:bg-wash"}`}
    >
      {artwork && song.thumb && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[10px] opacity-0 motion-safe:transition-opacity [@media(hover:hover)]:group-hover:opacity-[0.35]"
        >
          <img src={song.thumb} alt="" className="h-full w-full scale-150 object-cover blur-lg" />
        </span>
      )}
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] py-1 pl-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="flex w-7 shrink-0 justify-center text-[13px] tabular-nums text-ink-2">
          {current ? (
            playing ? (
              <EqBars playing />
            ) : (
              <span aria-hidden="true" className="text-accent">
                ▸
              </span>
            )
          ) : (
            <>
              <span className="group-hover:hidden">{index + 1}</span>
              <span aria-hidden="true" className="hidden text-ink-1 group-hover:block">
                <Icon icon={PlayIcon} />
              </span>
            </>
          )}
        </span>
        {artwork && <Artwork src={song.thumb} />}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center text-[14px] font-medium text-ink-1">
            {song.explicit && <ExplicitBadge />}
            <span className="truncate">{song.title}</span>
          </span>
          <span className="block truncate text-[13px] text-ink-2">{song.artist}</span>
        </span>
        {showAlbum && song.album && (
          <span className="hidden w-[30%] min-w-0 truncate text-[13px] text-ink-2 md:block">{song.album}</span>
        )}
        {song.duration > 0 && (
          <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-ink-2">
            {fmtTime(song.duration)}
          </span>
        )}
      </button>
      <span data-no-drag className="contents">
        <LikeButton track={song} className="h-11 w-11" />
        <ActionMenu items={menu} label={`More options for ${song.title}`} />
      </span>
    </li>
  );
}

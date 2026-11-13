import { PlayIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { EqBars } from "./EqBars";
import { FitText } from "./FitText";
import { ExplicitBadge } from "./ExplicitBadge";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { type MenuSource, openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Artwork } from "./SearchRows";
import { normalizeCredit } from "../lib/credits";
import { fmtTime } from "../lib/format";
import type { SearchSong } from "../lib/searchParse";
import type { SortableRowProps } from "../lib/useSortable";

const ROW_MENU =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type TrackRowProps = {
  index?: number;
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
  const indicator = current ? (
    playing ? (
      <EqBars playing />
    ) : (
      <span aria-hidden="true" className="text-accent">
        ▸
      </span>
    )
  ) : null;
  return (
    <li
      {...rowProps}
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => {
        if (!openMenuFromKey(event, menu)) rowProps?.onKeyDown(event);
      }}
      className={`group relative isolate flex h-14 items-center gap-1 rounded-[10px] pr-2 motion-safe:transition-colors after:absolute after:bottom-0 after:right-3 after:h-px after:bg-card-edge/[0.06] last:after:hidden ${dividerInset} ${current ? "bg-wash" : "[@media(hover:hover)]:hover:bg-wash/60"}`}
    >
      <button
        type="button"
        onClick={onPlay}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] py-1 pl-2 pr-2 text-left group-hover:pr-20 group-focus-within:pr-20 [@media(hover:none)]:pr-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {index !== undefined && (
          <span className="flex w-7 shrink-0 justify-center text-[13px] tabular-nums text-ink-2">
            {indicator ?? (
              <>
                <span className="group-hover:hidden">{index + 1}</span>
                <span aria-hidden="true" className="hidden text-ink-1 group-hover:block">
                  <Icon icon={PlayIcon} />
                </span>
              </>
            )}
          </span>
        )}
        {artwork &&
          (index === undefined ? (
            <span className="relative flex shrink-0">
              <Artwork src={song.thumb} size="h-10 w-10" />
              <span
                aria-hidden="true"
                className={`absolute inset-0 place-items-center rounded-md bg-scrim/40 text-on-scrim ${current ? "grid" : "hidden group-hover:grid"}`}
              >
                {indicator ?? <Icon icon={PlayIcon} />}
              </span>
            </span>
          ) : (
            <Artwork src={song.thumb} size="h-10 w-10" />
          ))}
        {index === undefined && !artwork && indicator && (
          <span className="flex w-5 shrink-0 justify-center text-[13px]">{indicator}</span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`flex min-w-0 items-center text-[14px] font-medium ${current ? "text-accent" : "text-ink-1"}`}>
            {song.explicit && <ExplicitBadge />}
            <FitText text={song.title} />
          </span>
          {song.artist && <span className="block truncate text-[13px] text-ink-2">{normalizeCredit(song.artist)}</span>}
        </span>
        {showAlbum && song.album && (
          <span className="hidden w-[30%] min-w-0 truncate text-[13px] text-ink-2 md:block">{song.album}</span>
        )}
        {song.duration > 0 && (
          <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-ink-2 group-hover:hidden group-focus-within:hidden [@media(hover:none)]:hidden">
            {fmtTime(song.duration)}
          </span>
        )}
      </button>
      <span
        data-no-drag
        className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <LikeButton track={song} className="h-9 w-9" />
        <ActionMenu items={menu} label={`More options for ${song.title}`} triggerClass={ROW_MENU} />
      </span>
    </li>
  );
}

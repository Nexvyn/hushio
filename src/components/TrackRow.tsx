import type { MouseEvent as ReactMouseEvent } from "react";
import { Clock, Play, SpeakerHigh } from "@phosphor-icons/react";
import { ActionMenu } from "./ActionMenu";
import { EqBars } from "./EqBars";
import { FitText } from "./FitText";
import { ExplicitBadge } from "./ExplicitBadge";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { type MenuSource, openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Artwork } from "./SearchRows";
import { normalizeCredit } from "../lib/credits";
import { formatAddedAt } from "../lib/dateAdded";
import { fmtTime } from "../lib/format";
import { prefetchTrack } from "../lib/prefetch";
import type { SearchSong } from "../lib/searchParse";
import type { SortableRowProps } from "../lib/useSortable";

const ROW_MENU =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function TrackListHeader({ showAlbum = false, showAdded = false }: { showAlbum?: boolean; showAdded?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-9 items-center gap-3 pl-2 pr-2 text-meta font-medium text-ink-2"
    >
      <span className="flex w-7 shrink-0 justify-center">#</span>
      <span className="w-10 shrink-0" />
      <span className="min-w-0 flex-1">Title</span>
      {showAlbum && <span className="hidden w-[30%] min-w-0 truncate md:block">Album</span>}
      {showAdded && <span className="hidden w-[140px] shrink-0 lg:block">Date added</span>}
      <span className="flex w-12 shrink-0 justify-end">
        <Icon icon={Clock} />
      </span>
    </div>
  );
}

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
  addedAt?: number;
  showAdded?: boolean;
  selected?: boolean;
  onSelectClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onContextSelect?: () => void;
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
  rowProps,
  addedAt,
  showAdded = false,
  selected = false,
  onSelectClick,
  onContextSelect,
}: TrackRowProps) {
  const indicator = current ? (
    playing ? (
      <EqBars playing />
    ) : (
      <span aria-hidden="true" className="text-accent">
        <Icon icon={SpeakerHigh} />
      </span>
    )
  ) : null;
  return (
    <li
      {...rowProps}
      onContextMenu={(event) => {
        onContextSelect?.();
        openMenuAtPointer(event, menu);
      }}
      onKeyDown={(event) => {
        if (!openMenuFromKey(event, menu)) rowProps?.onKeyDown(event);
      }}
      className={`group relative isolate flex h-14 items-center gap-1 rounded-[10px] pr-2 motion-safe:transition-colors motion-safe:duration-fade ${selected ? "bg-selected" : current ? "bg-wash" : "[@media(hover:hover)]:hover:bg-wash/60"}`}
    >
      <button
        type="button"
        onPointerDown={() => void prefetchTrack(song.id)}
        onClick={(event) => (onSelectClick ? onSelectClick(event) : onPlay())}
        onDoubleClick={onSelectClick ? onPlay : undefined}
        onKeyDown={
          onSelectClick
            ? (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                onPlay();
              }
            : undefined
        }
        className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] py-1 pl-2 pr-2 text-left group-hover:pr-20 group-focus-within:pr-20 [@media(hover:none)]:pr-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {index !== undefined && (
          <span className="flex w-7 shrink-0 justify-center text-meta tabular-nums text-ink-2">
            {indicator ?? (
              <>
                <span className="group-hover:hidden">{index + 1}</span>
                <span aria-hidden="true" className="hidden text-ink-1 group-hover:block">
                  <Icon icon={Play} />
                </span>
              </>
            )}
          </span>
        )}
        {artwork &&
          (index === undefined ? (
            <span className="relative flex shrink-0">
              <Artwork src={song.thumb} size="h-10 w-10" radius="rounded-[4px]" />
              <span
                aria-hidden="true"
                className={`absolute inset-0 place-items-center rounded-[4px] bg-scrim/40 text-on-scrim ${current ? "grid" : "hidden group-hover:grid"}`}
              >
                {indicator ?? <Icon icon={Play} />}
              </span>
            </span>
          ) : (
            <Artwork src={song.thumb} size="h-10 w-10" radius="rounded-[4px]" />
          ))}
        {index === undefined && !artwork && indicator && (
          <span className="flex w-5 shrink-0 justify-center text-meta">{indicator}</span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`flex min-w-0 items-center text-body font-medium ${current ? "text-accent" : "text-ink-1"}`}>
            {song.explicit && <ExplicitBadge />}
            <FitText text={song.title} />
          </span>
          {song.artist && <span className="block truncate text-meta text-ink-2">{normalizeCredit(song.artist)}</span>}
        </span>
        {showAlbum && song.album && (
          <span className="hidden w-[30%] min-w-0 truncate text-meta text-ink-2 md:block">{song.album}</span>
        )}
        {showAdded && (
          <span className="hidden w-[140px] shrink-0 truncate text-meta text-ink-2 lg:block">
            {formatAddedAt(addedAt, Date.now())}
          </span>
        )}
        {song.duration > 0 && (
          <span className="w-12 shrink-0 text-right text-meta tabular-nums text-ink-2 group-hover:hidden group-focus-within:hidden [@media(hover:none)]:hidden">
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

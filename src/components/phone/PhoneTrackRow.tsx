import type { MouseEvent } from "react";
import { motion } from "motion/react";
import { MoreHorizontalIcon, VolumeHighIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "../ActionMenu";
import { openMenuAtPointer, openMenuFromKey, type MenuSource } from "../ContextMenu";
import { EqBars } from "../EqBars";
import { ExplicitBadge } from "../ExplicitBadge";
import { Icon } from "../Icon";
import { PhoneArt } from "./PhoneArt";
import { PressRow } from "./PressRow";
import { thumbArtwork } from "../../lib/artwork";
import { normalizeCredit } from "../../lib/credits";
import { gate, reducedMotion, settle } from "../../lib/motion";
import type { SearchSong } from "../../lib/searchParse";
import type { Point } from "../../lib/touchGesture";
import { usePageVisible } from "../../lib/usePageVisible";
import type { SortableRowProps } from "../../lib/useSortable";
import type { Track } from "../../types";

export const PHONE_ROW_DP = 60;
const ROW_THUMB_TARGET = 48;

type PhoneTrackRowProps = {
  track: Track;
  index: number;
  active?: boolean;
  dragOffset?: number;
  dragging?: boolean;
  onPress: () => void;
  onLongPress?: (point: Point) => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function PhoneTrackRow({ track, index, active = false, dragOffset = 0, dragging = false, onPress, onLongPress, onMore }: PhoneTrackRowProps) {
  const reduced = reducedMotion();
  return (
    <motion.div
      data-index={index}
      animate={{ y: dragOffset }}
      transition={gate(reduced, settle)}
      className={`flex items-center bg-base ${dragging ? "relative z-10 rounded-[10px]" : ""}`}
      style={{ height: PHONE_ROW_DP, boxShadow: dragging ? "var(--shadow-held)" : undefined }}
    >
      <PressRow
        label={`Play ${track.title}`}
        className="h-full min-w-0 flex-1 pl-4 pr-1"
        contentClassName="gap-3"
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <PhoneArt src={thumbArtwork(track.thumb, ROW_THUMB_TARGET) || null} radius="rounded-[6px]" className="block size-12 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="truncate text-[15px] font-medium leading-5 text-ink-1">{track.title}</span>
          <span className="truncate text-[13px] leading-[18px] text-ink-2">{track.artist}</span>
        </span>
        {active && (
          <span className="shrink-0 text-ink-1">
            <Icon icon={VolumeHighIcon} />
          </span>
        )}
      </PressRow>
      <button
        type="button"
        aria-label={`More options for ${track.title}`}
        onClick={onMore}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Icon icon={MoreHorizontalIcon} />
      </button>
    </motion.div>
  );
}

type PhoneSongRowProps = {
  index: number;
  song: SearchSong;
  current: boolean;
  playing: boolean;
  menu: MenuSource;
  onPlay: () => void;
  numbered?: boolean;
  showArtist?: boolean;
  rowProps?: SortableRowProps;
};

export function PhoneSongRow({
  index,
  song,
  current,
  playing,
  menu,
  onPlay,
  numbered = false,
  showArtist = true,
  rowProps,
}: PhoneSongRowProps) {
  const artist = song.artist ? normalizeCredit(song.artist) : "";
  const visible = usePageVisible();
  const animate = current && playing && visible && !reducedMotion();
  return (
    <li
      {...rowProps}
      onContextMenu={(event) => openMenuAtPointer(event, menu)}
      onKeyDown={(event) => {
        if (!openMenuFromKey(event, menu)) rowProps?.onKeyDown(event);
      }}
      className="flex h-14 items-center"
    >
      <PressRow label={`Play ${song.title}`} className="h-full min-w-0 flex-1" contentClassName="gap-3" onPress={onPlay}>
        {numbered ? (
          <span className="flex w-6 shrink-0 justify-center text-[13.5px] tabular-nums text-ink-2">
            {current ? <EqBars playing={animate} /> : index + 1}
          </span>
        ) : (
          <PhoneArt src={thumbArtwork(song.thumb, ROW_THUMB_TARGET) || null} radius="rounded-[6px]" className="block size-12 shrink-0">
            {current && (
              <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-scrim/40 text-on-scrim">
                <EqBars playing={animate} />
              </span>
            )}
          </PhoneArt>
        )}
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span
            title={song.title}
            className={`flex min-w-0 items-center text-[16px] leading-[22px] ${current ? "font-medium text-accent" : "font-normal text-ink-1"}`}
          >
            {song.explicit && <ExplicitBadge />}
            <span className="truncate">{song.title}</span>
          </span>
          {showArtist && artist && <span className="truncate text-[13.5px] leading-[18px] text-ink-2">{artist}</span>}
        </span>
      </PressRow>
      <span data-no-drag className="flex shrink-0 items-center">
        <ActionMenu
          items={menu}
          label={`More options for ${song.title}`}
          triggerClass="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 motion-safe:transition-colors hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
      </span>
    </li>
  );
}

import type { MouseEvent } from "react";
import { motion } from "motion/react";
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { RowThumb } from "../RowThumb";
import { PressRow } from "./PressRow";
import { gate, reducedMotion, settle } from "../../lib/motion";
import { TRACK_ROW_DP } from "../../lib/virtualWindow";
import type { Point } from "../../lib/touchGesture";
import type { Track } from "../../types";

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
      className={`flex items-center bg-base ${dragging ? "relative z-10 rounded-[9px]" : ""}`}
      style={{ height: TRACK_ROW_DP, boxShadow: dragging ? "var(--shadow-held)" : undefined }}
    >
      <PressRow label={`Play ${track.title}`} className="h-full min-w-0 flex-1 gap-3 pl-4 pr-1" onPress={onPress} onLongPress={onLongPress}>
        <RowThumb src={track.thumb} size={TRACK_ROW_DP - 8} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-[13px] font-medium ${active ? "text-accent" : "text-ink-1"}`}>{track.title}</span>
          <span className="truncate text-[11.5px] text-ink-2">{track.artist}</span>
        </span>
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

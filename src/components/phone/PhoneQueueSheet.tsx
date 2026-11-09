import { useState, type PointerEvent } from "react";
import { AnimatePresence } from "motion/react";
import { Sheet } from "./Sheet";
import { PhoneTrackRow } from "./PhoneTrackRow";
import { VirtualList } from "../VirtualList";
import { dropIndex, slideOffset } from "../../lib/dragReorder";
import { hapticTick } from "../../lib/bridge";
import { songOf, trackMenuItems } from "../../lib/trackActions";
import type { Point } from "../../lib/touchGesture";
import { TRACK_ROW_DP } from "../../lib/virtualWindow";
import { usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";
import type { Track } from "../../types";

const SNAP_HEIGHTS = { low: "40vh", high: "90vh" } as const;

type Drag = { from: number; travel: number; start: number } | null;

function QueueBody() {
  const queue = usePlayer((state) => state.queue);
  const index = usePlayer((state) => state.index);
  const jumpTo = usePlayer((state) => state.jumpTo);
  const moveUpcoming = usePlayer((state) => state.moveUpcoming);
  const clearUpcoming = usePlayer((state) => state.clearUpcoming);
  const closePhoneQueue = useUI((state) => state.closePhoneQueue);
  const openContextMenu = useUI((state) => state.openContextMenu);
  const [snap, setSnap] = useState<keyof typeof SNAP_HEIGHTS>("low");
  const [drag, setDrag] = useState<Drag>(null);

  const upcoming = queue.slice(index + 1).map((track, offset) => ({ track, at: index + 1 + offset }));
  const current = queue[index];
  const from = drag?.from ?? -1;
  const target = drag ? Math.max(index + 1, dropIndex(drag.from, drag.travel, TRACK_ROW_DP, queue.length)) : -1;

  const finish = () => {
    if (drag && target !== drag.from) moveUpcoming(drag.from, target);
    setDrag(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ ...drag, travel: event.clientY - drag.start });
  };

  const menuFor = (track: Track, event: { currentTarget: EventTarget & Element }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(rect.left, rect.top, trackMenuItems(songOf(track)));
  };

  const beginDrag = (at: number, point: Point) => {
    setDrag({ from: at, travel: 0, start: point.y });
    void hapticTick().catch(() => {});
  };

  const sheetHeight = SNAP_HEIGHTS[snap];

  return (
    <Sheet
      label="Queue"
      onClose={closePhoneQueue}
      height={sheetHeight}
      header={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSnap((value) => (value === "low" ? "high" : "low"))}
            aria-label={snap === "low" ? "Expand queue" : "Shrink queue"}
            className="min-h-12 text-left text-[15px] font-semibold text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Queue
          </button>
          <button
            type="button"
            onClick={clearUpcoming}
            disabled={upcoming.length === 0}
            className="min-h-12 px-3 text-[13px] font-medium text-ink-2 disabled:opacity-[var(--disabled-opacity)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Clear
          </button>
        </div>
      }
    >
      <div className="flex flex-col pb-2" onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}>
        {current && (
          <>
            <p className="px-4 pb-1 pt-2 text-[11.5px] text-ink-2">Now playing</p>
            <PhoneTrackRow
              track={current}
              index={index}
              active
              onPress={() => jumpTo(index)}
              onMore={(event) => menuFor(current, event)}
            />
          </>
        )}
        <p className="px-4 pb-1 pt-2 text-[11.5px] text-ink-2">Next up</p>
        {upcoming.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-ink-2">Nothing up next</p>
        ) : (
          <VirtualList
            label="Next up"
            items={upcoming}
            rowHeight={TRACK_ROW_DP}
            getKey={(item) => `${item.at}:${item.track.id}`}
            renderRow={({ track, at }) => (
              <PhoneTrackRow
                track={track}
                index={at}
                dragging={drag?.from === at}
                dragOffset={drag && from !== at ? slideOffset(at, from, target, TRACK_ROW_DP) : 0}
                onPress={() => jumpTo(at)}
                onLongPress={(point) => beginDrag(at, point)}
                onMore={(event) => menuFor(track, event)}
              />
            )}
          />
        )}
      </div>
    </Sheet>
  );
}

export function PhoneQueueSheet() {
  const open = useUI((state) => state.phoneQueueOpen);
  return <AnimatePresence>{open && <QueueBody key="phone-queue" />}</AnimatePresence>;
}

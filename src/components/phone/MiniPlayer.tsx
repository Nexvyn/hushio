import { motion } from "motion/react";
import {
  Loading03Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { RowThumb } from "../RowThumb";
import { gate, quick, reducedMotion } from "../../lib/motion";
import { MINI_GAP_DP, MINI_PLAYER_DP, TAB_BAR_DP, INSET_BOTTOM } from "../../lib/phoneNav";
import { usePointerSwipe } from "../../lib/usePointerSwipe";
import { currentTrack, usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

export function MiniPlayer() {
  const track = usePlayer(currentTrack);
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const toggle = usePlayer((state) => state.toggle);
  const next = usePlayer((state) => state.next);
  const openNowPlaying = useUI((state) => state.openNowPlaying);
  const swipe = usePointerSwipe((direction) => {
    if (direction === "up") openNowPlaying();
  });
  const reduced = reducedMotion();

  if (!track) return null;

  const fraction = duration > 0 ? Math.min(1, position / duration) : 0;
  const playLabel = playing ? "Pause" : "Play";

  return (
    <motion.div
      role="region"
      aria-label="Mini player"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={gate(reduced, quick)}
      className="absolute inset-x-2 z-20"
      style={{ bottom: `calc(${TAB_BAR_DP + MINI_GAP_DP}px + ${INSET_BOTTOM})` }}
      {...swipe}
    >
      <div
        className="relative flex overflow-hidden rounded-[14px] border border-separator bg-elevated pl-2 pr-1 shadow-[var(--shadow-popover)]"
        style={{ height: MINI_PLAYER_DP }}
      >
        <button
          type="button"
          aria-label={`Open Now Playing: ${track.title}`}
          onClick={openNowPlaying}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <RowThumb src={track.thumb} size={48} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium leading-[18px] text-ink-1">{track.title}</span>
            <span className="truncate text-[11.5px] leading-[15px] text-ink-2">{track.artist}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label={playLabel}
          title={playLabel}
          onClick={toggle}
          className="grid h-12 w-12 shrink-0 place-items-center self-center rounded-full text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {buffering ? (
            <span className="grid place-items-center motion-safe:animate-spin">
              <Icon icon={Loading03Icon} />
            </span>
          ) : (
            <Icon icon={playing ? PauseIcon : PlayIcon} />
          )}
        </button>
        <button
          type="button"
          aria-label="Next"
          title="Next"
          onClick={() => next(true)}
          className="grid h-12 w-12 shrink-0 place-items-center self-center rounded-full text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <Icon icon={NextIcon} />
        </button>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[2px] bg-wash">
          <div
            className="h-full origin-left bg-[rgb(var(--ink-1)/0.055)] motion-safe:transition-transform motion-safe:duration-reading"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      </div>
    </motion.div>
  );
}

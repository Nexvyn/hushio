import { Plus, Minus } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { describeLyricsShift, LYRICS_NUDGE_STEP, useLyricsNudge } from "../stores/lyricsNudge";

const STEP_BUTTON =
  "hit-area grid h-7 w-7 place-items-center rounded-full text-ink-1 hover:bg-white/10 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function LyricsTiming({ trackId, className = "" }: { trackId: string; className?: string }) {
  const nudge = useLyricsNudge((state) => state.nudges[trackId] ?? 0);
  const adjust = useLyricsNudge((state) => state.nudge);
  const resetNudge = useLyricsNudge((state) => state.resetNudge);
  const nudged = nudge !== 0;
  const visibility = nudged ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100";

  return (
    <div
      role="group"
      aria-label="Lyrics timing for this song"
      className={`flex h-9 items-center gap-0.5 rounded-full bg-black/40 px-1 text-meta text-ink-1/80 motion-safe:transition-opacity ${visibility} ${className}`}
    >
      <button
        type="button"
        title="Show lyrics earlier ( [ )"
        aria-label="Show lyrics earlier"
        onClick={() => adjust(trackId, -LYRICS_NUDGE_STEP)}
        className={STEP_BUTTON}
      >
        <Icon icon={Minus} />
      </button>
      <button
        type="button"
        disabled={!nudged}
        title={nudged ? "Reset this song's lyrics timing" : "Lyrics timing for this song"}
        onClick={() => resetNudge(trackId)}
        className="min-w-[88px] rounded-full px-1 text-center tabular-nums enabled:hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {nudged ? describeLyricsShift(nudge) : "Lyrics timing"}
      </button>
      <button
        type="button"
        title="Show lyrics later ( ] )"
        aria-label="Show lyrics later"
        onClick={() => adjust(trackId, LYRICS_NUDGE_STEP)}
        className={STEP_BUTTON}
      >
        <Icon icon={Plus} />
      </button>
    </div>
  );
}

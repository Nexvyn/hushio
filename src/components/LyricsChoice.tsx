import { useRef, useState } from "react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { LyricsSearchDialog } from "./LyricsSearchDialog";
import { lyricsReset } from "../lib/bridge";
import { forgetLyrics } from "../lib/lyrics";
import type { Track } from "../types";

const PILL_BUTTON =
  "hit-area flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-1 hover:bg-white/10 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type LyricsChoiceProps = {
  track: Track;
  duration: number;
  overridden: boolean;
  onChanged: () => void;
  className?: string;
};

export function LyricsChoice({ track, duration, overridden, onChanged, className = "" }: LyricsChoiceProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const picked = () => {
    setOpen(false);
    onChanged();
    trigger.current?.focus();
  };

  const reset = () => {
    lyricsReset(track.id)
      .catch(() => undefined)
      .then(() => {
        forgetLyrics(track.id);
        onChanged();
      });
  };

  return (
    <>
      <div role="group" aria-label="Lyrics source" className={`flex h-9 items-center gap-0.5 rounded-full bg-black/40 px-1 ${className}`}>
        <button ref={trigger} type="button" onClick={() => setOpen(true)} className={PILL_BUTTON}>
          <Icon icon={Search01Icon} />
          <span>Search lyrics</span>
        </button>
        {overridden && (
          <button type="button" onClick={reset} className={PILL_BUTTON}>
            Reset to automatic
          </button>
        )}
      </div>
      {open && <LyricsSearchDialog track={track} duration={duration} onClose={close} onPicked={picked} />}
    </>
  );
}

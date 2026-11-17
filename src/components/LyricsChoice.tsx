import { lyricsReset } from "../lib/bridge";
import { forgetLyrics } from "../lib/lyrics";
import type { Track } from "../types";

const PILL_BUTTON =
  "hit-area flex h-7 items-center gap-1.5 rounded-full px-3 text-meta font-medium text-ink-1 hover:bg-white/10 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type LyricsChoiceProps = {
  track: Track;
  overridden: boolean;
  onChanged: () => void;
  className?: string;
};

export function LyricsChoice({ track, overridden, onChanged, className = "" }: LyricsChoiceProps) {
  const reset = () => {
    lyricsReset(track.id)
      .catch(() => undefined)
      .then(() => {
        forgetLyrics(track.id);
        onChanged();
      });
  };

  if (!overridden) return null;

  return (
    <div role="group" aria-label="Lyrics source" className={`flex h-9 items-center gap-0.5 rounded-full bg-black/40 px-1 ${className}`}>
      <button type="button" onClick={reset} className={PILL_BUTTON}>
        Reset to automatic
      </button>
    </div>
  );
}

import { motion } from "motion/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { LyricsTiming } from "./LyricsTiming";
import { SyncedLyrics } from "./SyncedLyrics";
import { reducedMotion, swap } from "../lib/motion";
import { useLyricsOffset, useLyricsTimingKeys } from "../lib/lyricsOffset";
import { useTrackLyrics } from "../lib/useTrackLyrics";
import { currentTrack, usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export function LyricsCenter() {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const closeLyrics = useUI((state) => state.closeLyrics);
  const trackId = track?.id ?? null;
  const offset = useLyricsOffset(trackId);
  const { lyrics, loading } = useTrackLyrics(track, duration);
  useLyricsTimingKeys(trackId);

  const reduced = reducedMotion();

  return (
    <motion.section
      aria-label="Lyrics"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={swap}
      className="group absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-surface"
    >
      <button
        type="button"
        title="Close lyrics (Esc)"
        aria-label="Close lyrics"
        onClick={closeLyrics}
        className="hit-area absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-ink-1 hover:bg-black/60 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Icon icon={Cancel01Icon} />
      </button>
      {track && <LyricsTiming trackId={track.id} className="absolute right-16 top-4 z-10" />}
      <div className="relative flex h-full flex-col px-10 pb-6 pt-14">
        {track ? (
          <SyncedLyrics
            key={track.id}
            lyrics={lyrics}
            loading={loading}
            offset={offset}
            trackKey={track.id}
          />
        ) : (
          <p className="m-auto text-[15px] text-ink-2">Play something to sing along.</p>
        )}
      </div>
    </motion.section>
  );
}

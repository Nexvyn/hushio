import { useState } from "react";
import { motion } from "motion/react";
import { Translate, X } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { LyricsChoice } from "./LyricsChoice";
import { LyricsTiming } from "./LyricsTiming";
import { SyncedLyrics } from "./SyncedLyrics";
import { fade, nowPlayingEnter, nowPlayingExit, reducedMotion } from "../lib/motion";
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
  const { lyrics, loading, reload } = useTrackLyrics(track, duration);
  useLyricsTimingKeys(trackId);
  const [translate, setTranslate] = useState(false);
  const hasTranslation = Boolean(lyrics?.synced?.some((line) => line.translation));

  const reduced = reducedMotion();

  return (
    <motion.section
      aria-label="Lyrics"
      initial={reduced ? false : { opacity: 0, scale: 0.97, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduced ? { opacity: 0, transition: fade } : { opacity: 0, scale: 0.97, y: 12, transition: nowPlayingExit }}
      transition={nowPlayingEnter}
      style={{ transformOrigin: "0% 100%" }}
      className="group absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-surface"
    >
      <button
        type="button"
        title="Close lyrics (Esc)"
        aria-label="Close lyrics"
        onClick={closeLyrics}
        className="hit-area absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-ink-1 hover:bg-black/60 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Icon icon={X} />
      </button>
      {track && (
        <div className="absolute right-16 top-4 z-10 flex items-center gap-2">
          {hasTranslation && (
            <button
              type="button"
              aria-label="Show translations"
              aria-pressed={translate}
              title="Show translations"
              onClick={() => setTranslate((value) => !value)}
              className={`hit-area grid h-9 w-9 place-items-center rounded-full motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                translate ? "bg-ink-1 text-base" : "bg-black/40 text-ink-1 hover:bg-black/60"
              }`}
            >
              <Icon icon={Translate} />
            </button>
          )}
          <LyricsTiming trackId={track.id} />
        </div>
      )}
      {track && (
        <LyricsChoice
          track={track}
          overridden={Boolean(lyrics?.custom)}
          onChanged={reload}
          className="absolute left-10 top-4 z-10"
        />
      )}
      <div className="relative flex h-full flex-col px-10 pb-6 pt-14">
        {track ? (
          <SyncedLyrics
            key={track.id}
            lyrics={lyrics}
            loading={loading}
            offset={offset}
            trackKey={track.id}
            translate={translate}
          />
        ) : (
          <p className="m-auto text-body text-ink-2">Play something to sing along.</p>
        )}
      </div>
    </motion.section>
  );
}

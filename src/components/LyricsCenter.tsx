import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { LyricsTiming } from "./LyricsTiming";
import { SyncedLyrics } from "./SyncedLyrics";
import type { LyricsResult } from "../lib/bridge";
import { requestLyrics } from "../lib/lyrics";
import { reducedMotion, swap } from "../lib/motion";
import { isTyping } from "../lib/shortcuts";
import { currentTrack, usePlayer } from "../stores/player";
import { LYRICS_NUDGE_STEP, useLyricsNudge } from "../stores/lyricsNudge";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

export function LyricsCenter() {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const closeLyrics = useUI((state) => state.closeLyrics);
  const deviceOffset = useSettings((state) => state.lyricsOffset);
  const trackId = track?.id ?? null;
  const nudge = useLyricsNudge((state) => (trackId ? (state.nudges[trackId] ?? 0) : 0));
  const [settled, setSettled] = useState<{ id: string; lyrics: LyricsResult | null } | null>(null);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    requestLyrics(track, duration).then((result) => {
      if (!cancelled) setSettled({ id: track.id, lyrics: result });
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const ready = settled !== null && settled.id === trackId;
  const lyrics = ready ? settled.lyrics : null;
  const loading = trackId !== null && !ready;

  useEffect(() => {
    if (!trackId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.code === "BracketLeft") {
        event.preventDefault();
        useLyricsNudge.getState().nudge(trackId, -LYRICS_NUDGE_STEP);
      } else if (event.code === "BracketRight") {
        event.preventDefault();
        useLyricsNudge.getState().nudge(trackId, LYRICS_NUDGE_STEP);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trackId]);

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
        className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-ink-1 hover:bg-black/60 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
            offset={deviceOffset + nudge}
            trackKey={track.id}
          />
        ) : (
          <p className="m-auto text-[15px] text-ink-2">Play something to sing along.</p>
        )}
      </div>
    </motion.section>
  );
}

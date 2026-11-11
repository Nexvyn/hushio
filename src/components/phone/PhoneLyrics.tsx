import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { SyncedLyrics } from "../SyncedLyrics";
import { PhoneLyricsSearch } from "./PhoneLyricsSearch";
import { lyricsReset } from "../../lib/bridge";
import { forgetLyrics } from "../../lib/lyrics";
import { useTrackLyrics } from "../../lib/useTrackLyrics";
import { useLyricsOffset } from "../../lib/lyricsOffset";
import { currentTrack, usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

const ACTION =
  "flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-wash px-4 text-[14px] font-medium text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function PhoneLyrics() {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const offset = useLyricsOffset(track?.id ?? null);
  const { lyrics, loading, reload } = useTrackLyrics(track, duration);
  const searchOpen = useUI((state) => state.phoneLyricsSearchOpen);
  const openSearch = useUI((state) => state.openPhoneLyricsSearch);
  const closeSearch = useUI((state) => state.closePhoneLyricsSearch);

  useEffect(() => () => closeSearch(), [closeSearch]);

  if (!track) return <p className="m-auto text-[15px] text-ink-2">Play something to sing along.</p>;

  const custom = Boolean(lyrics?.custom);
  const hasText = Boolean(lyrics?.synced?.length || lyrics?.plain?.trim());
  const empty = !loading && !hasText;

  const reset = () => {
    lyricsReset(track.id)
      .catch(() => undefined)
      .then(() => {
        forgetLyrics(track.id);
        reload();
      });
  };

  const picked = () => {
    closeSearch();
    reload();
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pb-2">
        {custom && (
          <button type="button" onClick={reset} className={ACTION}>
            Reset to automatic
          </button>
        )}
        <button type="button" onClick={openSearch} className={ACTION}>
          <Icon icon={Search01Icon} />
          <span>Search lyrics</span>
        </button>
      </div>
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-[15px] text-ink-2">No lyrics</p>
          <button type="button" onClick={openSearch} className={ACTION}>
            <Icon icon={Search01Icon} />
            <span>Search lyrics</span>
          </button>
        </div>
      ) : (
        <SyncedLyrics key={track.id} lyrics={lyrics} loading={loading} offset={offset} trackKey={track.id} />
      )}
      {createPortal(
        <AnimatePresence>
          {searchOpen && (
            <PhoneLyricsSearch key={track.id} track={track} duration={duration} onClose={closeSearch} onPicked={picked} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

import { useContext, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "../Icon";
import { SyncedLyrics } from "../SyncedLyrics";
import { PhoneLyricsSearch } from "./PhoneLyricsSearch";
import { lyricsReset } from "../../lib/bridge";
import { forgetLyrics } from "../../lib/lyrics";
import { OnArtContext } from "../../lib/onArt";
import { useTrackLyrics } from "../../lib/useTrackLyrics";
import { useLyricsOffset } from "../../lib/lyricsOffset";
import { currentTrack, usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

const ICON_BASE =
  "grid size-11 shrink-0 place-items-center rounded-full motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const TEXT_BASE =
  "flex min-h-11 shrink-0 items-center rounded-full px-3 text-[14px] font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function PhoneLyrics() {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const offset = useLyricsOffset(track?.id ?? null);
  const { lyrics, loading, reload } = useTrackLyrics(track, duration);
  const searchOpen = useUI((state) => state.phoneLyricsSearchOpen);
  const openSearch = useUI((state) => state.openPhoneLyricsSearch);
  const closeSearch = useUI((state) => state.closePhoneLyricsSearch);
  const onArt = useContext(OnArtContext);

  useEffect(() => () => closeSearch(), [closeSearch]);

  if (!track) return <p className="m-auto text-[15px] text-ink-2">Play something to sing along.</p>;

  const custom = Boolean(lyrics?.custom);
  const hasText = Boolean(lyrics?.synced?.length || lyrics?.plain?.trim());
  const empty = !loading && !hasText;
  const tone = onArt ? "text-art hover:bg-art/[0.12]" : "text-ink-1 hover:bg-wash";
  const iconClass = `${ICON_BASE} ${tone}`;
  const textClass = `${TEXT_BASE} ${tone}`;

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
    <div className="flex h-full w-full min-h-0 flex-col pb-4">
      {!empty && (
        <div className="flex h-11 shrink-0 items-center justify-between gap-2">
          {custom ? (
            <button type="button" onClick={reset} className={textClass}>
              Reset to automatic
            </button>
          ) : (
            <span />
          )}
          <button type="button" aria-label="Search lyrics" title="Search lyrics" onClick={openSearch} className={iconClass}>
            <Icon icon={Search01Icon} />
          </button>
        </div>
      )}
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className={`text-[14px] leading-5 ${onArt ? "text-art/[0.72]" : "text-ink-2"}`}>No lyrics</p>
          <button type="button" onClick={openSearch} className={textClass}>
            Search lyrics
          </button>
        </div>
      ) : (
        <SyncedLyrics key={track.id} lyrics={lyrics} loading={loading} offset={offset} trackKey={track.id} onArt={onArt} />
      )}
      {createPortal(
        <OnArtContext.Provider value={false}>
          <AnimatePresence>
            {searchOpen && (
              <PhoneLyricsSearch key={track.id} track={track} duration={duration} onClose={closeSearch} onPicked={picked} />
            )}
          </AnimatePresence>
        </OnArtContext.Provider>,
        document.body,
      )}
    </div>
  );
}

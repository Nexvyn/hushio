import { AnimatePresence } from "motion/react";
import { Sheet } from "./phone/Sheet";
import { CreditsBlock } from "./CreditsBlock";
import { RowThumb } from "./RowThumb";
import { normalizeCredit } from "../lib/credits";
import { fmtTime } from "../lib/format";
import type { SearchSong } from "../lib/searchParse";
import { useSongInfo } from "../stores/songInfo";

function infoRows(song: SearchSong): [string, string][] {
  const rows: [string, string][] = [["Title", song.title], ["Artist", normalizeCredit(song.artist)]];
  if (song.album) rows.push(["Album", song.album]);
  if (song.duration > 0) rows.push(["Duration", fmtTime(song.duration)]);
  return rows;
}

function SongInfoBody({ song, onClose }: { song: SearchSong; onClose: () => void }) {
  return (
    <Sheet
      label="Song info"
      onClose={onClose}
      header={
        <div className="flex items-center gap-3 pb-2">
          <RowThumb src={song.thumb} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-meta font-semibold text-ink-1">{song.title}</p>
            <p className="truncate text-caption text-ink-2">{normalizeCredit(song.artist)}</p>
          </div>
        </div>
      }
    >
      <dl className="flex flex-col pb-4">
        {infoRows(song).map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="shrink-0 text-meta text-ink-2">{label}</dt>
            <dd className="min-w-0 truncate text-right text-meta text-ink-1">{value}</dd>
          </div>
        ))}
      </dl>
      <CreditsBlock song={song} />
    </Sheet>
  );
}

export function SongInfoSheet() {
  const song = useSongInfo((state) => state.song);
  const close = useSongInfo((state) => state.close);
  return <AnimatePresence>{song && <SongInfoBody key={song.id} song={song} onClose={close} />}</AnimatePresence>;
}

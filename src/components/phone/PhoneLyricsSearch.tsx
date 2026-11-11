import { LyricsSearchPanel } from "../LyricsSearchDialog";
import { Sheet } from "./Sheet";
import type { Track } from "../../types";

type PhoneLyricsSearchProps = {
  track: Track;
  duration: number;
  onClose: () => void;
  onPicked: () => void;
};

export function PhoneLyricsSearch({ track, duration, onClose, onPicked }: PhoneLyricsSearchProps) {
  return (
    <Sheet label="Search lyrics" onClose={onClose} height="90vh" zClass="z-[125]">
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1">
        <LyricsSearchPanel track={track} duration={duration} onClose={onClose} onPicked={onPicked} touch />
      </div>
    </Sheet>
  );
}

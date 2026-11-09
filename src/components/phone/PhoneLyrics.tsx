import { SyncedLyrics } from "../SyncedLyrics";
import { useTrackLyrics } from "../../lib/useTrackLyrics";
import { useLyricsOffset } from "../../lib/lyricsOffset";
import { currentTrack, usePlayer } from "../../stores/player";

export function PhoneLyrics() {
  const track = usePlayer(currentTrack);
  const duration = usePlayer((state) => state.duration);
  const offset = useLyricsOffset(track?.id ?? null);
  const { lyrics, loading } = useTrackLyrics(track, duration);

  if (!track) return <p className="m-auto text-[15px] text-ink-2">Play something to sing along.</p>;

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <SyncedLyrics key={track.id} lyrics={lyrics} loading={loading} offset={offset} trackKey={track.id} />
    </div>
  );
}

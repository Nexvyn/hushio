import { useEffect, useState } from "react";
import type { ImportSong } from "./importParse";
import { matchSong } from "./importMatch";
import type { SearchSong } from "./searchParse";

export const MATCH_WORKERS = 4;

export type MatchState =
  | { status: "matched"; track: SearchSong }
  | { status: "missing" }
  | { status: "failed" };

export function useSongMatches(
  songs: readonly ImportSong[],
  prefer: string,
  attempt: number,
): (MatchState | undefined)[] {
  const [states, setStates] = useState<(MatchState | undefined)[]>([]);

  useEffect(() => {
    const results: (MatchState | undefined)[] = new Array<MatchState | undefined>(songs.length);
    let next = 0;
    let stopped = false;
    let frame: number | null = null;

    const flush = () => {
      frame = null;
      if (!stopped) setStates([...results]);
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(flush);
    };

    const worker = async () => {
      while (!stopped && next < songs.length) {
        const index = next;
        next += 1;
        try {
          const track = await matchSong(songs[index], prefer);
          results[index] = track ? { status: "matched", track } : { status: "missing" };
        } catch {
          results[index] = { status: "failed" };
        }
        schedule();
      }
    };

    setStates((previous) => (previous.length === 0 ? previous : []));
    const workers = Array.from({ length: Math.min(MATCH_WORKERS, songs.length) }, () => worker());
    void Promise.all(workers);

    return () => {
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [songs, prefer, attempt]);

  return states;
}

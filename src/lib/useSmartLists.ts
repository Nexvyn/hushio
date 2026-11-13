import { useEffect, useMemo, useState } from "react";
import { replayJournal } from "./bridge";
import type { JournalEntry } from "./replay";
import { buildSmartLists, type SmartList } from "./smartLists";
import { useLibrary } from "../stores/library";

export function useJournal(): JournalEntry[] {
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  useEffect(() => {
    let active = true;
    replayJournal()
      .then((entries) => {
        if (active) setJournal(entries);
      })
      .catch((error: unknown) => {
        console.warn(`[hushio] play journal failed: ${String(error)}`);
      });
    return () => {
      active = false;
    };
  }, []);
  return journal;
}

export function useSmartLists(): SmartList[] {
  const liked = useLibrary((state) => state.liked);
  const playlists = useLibrary((state) => state.playlists);
  const journal = useJournal();
  return useMemo(() => buildSmartLists({ liked, playlists, journal, now: Date.now() }), [liked, playlists, journal]);
}

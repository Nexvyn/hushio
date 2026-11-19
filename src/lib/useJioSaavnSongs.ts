import { useEffect, useState } from "react";
import { searchJioSaavnSongs } from "./jiosaavn";
import type { SearchSong } from "./searchParse";

type Songs = { query: string; items: SearchSong[] };

export function useJioSaavnSongs(query: string, enabled: boolean): SearchSong[] {
  const [songs, setSongs] = useState<Songs>({ query: "", items: [] });

  useEffect(() => {
    if (!enabled || !query) return;
    let live = true;
    searchJioSaavnSongs(query).then(
      (items) => {
        if (live) setSongs({ query, items });
      },
      () => {
        if (live) setSongs({ query, items: [] });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, query]);

  return enabled && songs.query === query ? songs.items : [];
}

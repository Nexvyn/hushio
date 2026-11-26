import { useEffect, useId, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import type { Playlist } from "../stores/library";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";
import { cachedSearchPage } from "../lib/search";
import type { SearchRow, SearchSong } from "../lib/searchParse";
import { usePhone } from "../lib/usePhone";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import { Artwork } from "./SearchRows";
import { focusRing } from "./HomeShelves";

export const FINDER_MAX_SONGS = 5;
const DEBOUNCE_MS = 300;

export function songsFromRows(rows: SearchRow[]): SearchSong[] {
  const seen = new Set<string>();
  const songs: SearchSong[] = [];
  for (const row of rows) {
    const song = row.kind === "track" ? row.track : row.kind === "top" ? row.song : null;
    if (!song || seen.has(song.id)) continue;
    seen.add(song.id);
    songs.push(song);
  }
  return songs;
}

type Result = { status: "ready" | "error"; query: string; songs: SearchSong[] };

export function PlaylistFinder({ playlist }: { playlist: Playlist }) {
  const phone = usePhone();
  const headingId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tracks = useLibrary((state) => state.playlists.find((item) => item.id === playlist.id)?.tracks ?? playlist.tracks);
  const inPlaylist = new Set(tracks.map((track) => track.id));

  useEffect(() => {
    const next = text.trim();
    if (!next) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => setQuery(next), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!query) return;
    let live = true;
    cachedSearchPage(query, "songs")
      .then((page) => {
        if (live) setResult({ status: "ready", query, songs: songsFromRows(page.rows) });
      })
      .catch(() => {
        if (live) setResult({ status: "error", query, songs: [] });
      });
    return () => {
      live = false;
    };
  }, [query, attempt]);

  const current = query && result?.query === query ? result : null;
  const iconSize = phone ? 24 : 20;

  function add(song: SearchSong) {
    if (useLibrary.getState().addToPlaylist(playlist.id, song)) {
      useUI.getState().toast(`Added to ${playlist.name}`, "success");
    }
  }

  function clear() {
    setText("");
    inputRef.current?.focus();
  }

  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-section font-semibold text-ink-1">
        Let's find something for your playlist
      </h2>
      <div className="relative mt-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
          {phone ? <PhoneIcon icon={MagnifyingGlass} size={iconSize} /> : <Icon icon={MagnifyingGlass} size={iconSize} />}
        </span>
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          aria-label="Search songs to add"
          placeholder="Search songs"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && text) clear();
          }}
          className={`${focusRing} h-10 w-full rounded-md bg-wash pl-10 pr-10 text-body text-ink-1 placeholder:text-ink-2 [@media(pointer:coarse)]:h-12`}
        />
        {text && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className={`${focusRing} absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:text-ink-1 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10`}
          >
            {phone ? <PhoneIcon icon={X} size={iconSize} /> : <Icon icon={X} size={iconSize} />}
          </button>
        )}
      </div>

      {!query && <p className="mt-3 text-meta text-ink-2">Type a song name to find songs to add.</p>}
      {query && !current && <p className="mt-3 text-meta text-ink-2" aria-live="polite">Searching…</p>}
      {current?.status === "error" && (
        <div role="alert" className="mt-3 flex items-center gap-3 text-meta text-ink-2">
          <span>Search failed. Check your connection and try again.</span>
          <button type="button" onClick={() => setAttempt((count) => count + 1)} className={`${focusRing} rounded-sm font-semibold text-ink-1 hover:underline`}>
            Try again
          </button>
        </div>
      )}
      {current?.status === "ready" && current.songs.length === 0 && (
        <p className="mt-3 text-meta text-ink-2">No songs found for "{current.query}". Try another name.</p>
      )}
      {current?.status === "ready" && current.songs.length > 0 && (
        <ol className="mt-3">
          {current.songs.map((song) => {
            const added = inPlaylist.has(song.id);
            return (
              <li key={song.id} className="flex items-center gap-3 py-1.5">
                <Artwork src={song.thumb} size={phone ? "h-12 w-12" : "h-10 w-10"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body text-ink-1">{song.title}</span>
                  <span className="block truncate text-meta text-ink-2">{song.artist}</span>
                </span>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => add(song)}
                  aria-label={added ? `${song.title} is in the playlist` : `Add ${song.title} to ${playlist.name}`}
                  className={`${focusRing} h-9 shrink-0 rounded-full px-4 text-meta font-semibold ${
                    added ? "text-ink-2" : "bg-wash text-ink-1 hover:bg-hover"
                  } disabled:cursor-default [@media(pointer:coarse)]:h-11`}
                >
                  {added ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

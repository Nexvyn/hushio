import { useEffect, useRef, useState } from "react";
import type { Playlist } from "../stores/library";
import { useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";
import { playFromRow } from "../stores/player";
import type { Track } from "../types";
import { cachedRecommendations, loadRecommendations, storeRecommendations } from "../lib/playlistRecommend";
import { useOnline } from "../lib/useOnline";
import { usePhone } from "../lib/usePhone";
import { Artwork } from "./SearchRows";
import { focusRing } from "./HomeShelves";

type Status = "idle" | "loading" | "ready" | "error";

export function PlaylistRecommendations({ playlist }: { playlist: Playlist }) {
  const phone = usePhone();
  const online = useOnline();
  const playlistId = playlist.id;
  const tracks = playlist.tracks;
  const hasTracks = tracks.length > 0;
  const cached = cachedRecommendations(playlistId);
  const [rows, setRows] = useState<Track[]>(cached ?? []);
  const [status, setStatus] = useState<Status>(cached ? "ready" : "idle");
  const round = useRef(0);
  const token = useRef(0);
  const headingId = `recommended-${playlistId}`;

  async function run(refresh: boolean) {
    const mine = ++token.current;
    if (refresh) round.current += 1;
    setStatus("loading");
    try {
      const picks = await loadRecommendations(tracks, refresh ? rows : [], round.current);
      if (mine !== token.current) return;
      storeRecommendations(playlistId, picks);
      setRows(picks);
      setStatus("ready");
    } catch {
      if (mine === token.current) setStatus("error");
    }
  }

  useEffect(() => {
    if (!hasTracks || !online || cachedRecommendations(playlistId)) return;
    void run(false);
  }, [hasTracks, online, playlistId]);

  if (!hasTracks || !online) return null;

  function add(track: Track) {
    const added = useLibrary.getState().addToPlaylist(playlistId, track);
    const next = rows.filter((row) => row.id !== track.id);
    setRows(next);
    storeRecommendations(playlistId, next);
    if (added) useUI.getState().toast(`Added to ${playlist.name}`, "success");
  }

  return (
    <section aria-labelledby={headingId} className="mt-10">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={headingId} className="text-section font-semibold text-ink-1">
            Recommended
          </h2>
          <p className="mt-0.5 text-meta text-ink-2">Based on what's in this playlist</p>
        </div>
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={status === "loading"}
          className={`${focusRing} shrink-0 rounded-sm text-meta font-semibold text-ink-1 hover:underline disabled:opacity-50 [@media(pointer:coarse)]:min-h-11`}
        >
          Refresh
        </button>
      </div>
      {status === "loading" && rows.length === 0 && <p className="mt-4 text-meta text-ink-2">Finding songs…</p>}
      {status === "error" && (
        <p role="alert" className="mt-4 text-meta text-ink-2">
          Couldn't load suggestions. Try Refresh.
        </p>
      )}
      {status === "ready" && rows.length === 0 && (
        <p className="mt-4 text-meta text-ink-2">No suggestions right now. Try Refresh.</p>
      )}
      {rows.length > 0 && (
        <ol className="mt-3">
          {rows.map((track, index) => (
            <li key={track.id} className="flex items-center gap-3 py-1.5">
              <button
                type="button"
                onClick={() => playFromRow(rows, index)}
                aria-label={`Play ${track.title}`}
                className={`${focusRing} flex min-w-0 flex-1 items-center gap-3 rounded-md text-left [@media(pointer:coarse)]:min-h-11`}
              >
                <Artwork src={track.thumb} size={phone ? "h-12 w-12" : "h-10 w-10"} />
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink-1">{track.title}</span>
                  <span className="block truncate text-meta text-ink-2">{track.artist}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => add(track)}
                aria-label={`Add ${track.title} to ${playlist.name}`}
                className={`${focusRing} h-9 shrink-0 rounded-full bg-wash px-4 text-meta font-semibold text-ink-1 hover:bg-hover [@media(pointer:coarse)]:h-11`}
              >
                Add
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

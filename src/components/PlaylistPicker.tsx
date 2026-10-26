import { useEffect, useRef, useState } from "react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { shortTitle } from "../lib/browseText";
import { addSongsToPlaylists } from "../lib/devicePlaylists";
import { plural } from "../lib/plural";
import { type Playlist, useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

export function PlaylistPicker() {
  const tracks = useUI((state) => state.playlistPicker);
  if (!tracks) return null;
  return <Picker tracks={tracks} />;
}

function holdsAll(playlist: Playlist, tracks: readonly Track[]): boolean {
  return tracks.every((track) => playlist.tracks.some((item) => item.id === track.id));
}

function trapTab(event: KeyboardEvent, panel: HTMLElement | null) {
  if (!panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const current = document.activeElement;
  if (event.shiftKey && (current === first || !panel.contains(current))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (current === last || !panel.contains(current))) {
    event.preventDefault();
    first.focus();
  }
}

function Picker({ tracks }: { tracks: Track[] }) {
  const playlists = useLibrary((state) => state.playlists);
  const closePlaylistPicker = useUI((state) => state.closePlaylistPicker);
  const panelRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [returnFocus] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );

  useEffect(() => {
    setPicked(new Set());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closePlaylistPicker();
      } else if (event.key === "Tab") {
        trapTab(event, panelRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>('[role="checkbox"]:not(:disabled)');
      (first ?? panel)?.focus();
    }, 30);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer);
    };
  }, [tracks, closePlaylistPicker]);

  useEffect(() => () => returnFocus?.focus(), [returnFocus]);

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function add() {
    addSongsToPlaylists([...picked], tracks);
    useUI.getState().toast(`Added to ${plural(picked.size, "playlist", "playlists")}`, "success");
    closePlaylistPicker();
  }

  const what = tracks.length === 1 ? `"${shortTitle(tracks[0].title)}"` : `${tracks.length} songs`;

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center animate-fade-in">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        aria-hidden="true"
        onMouseDown={closePlaylistPicker}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add to playlists"
        tabIndex={-1}
        className="glass-strong animate-pop-in relative w-[min(420px,calc(100vw-48px))] rounded-2xl p-6 outline-none"
      >
        <h2 className="font-display text-lg font-bold tracking-tight text-ink-1">Add to playlists</h2>
        <p className="mt-1.5 text-[13px] text-ink-2 [overflow-wrap:anywhere]">
          Choose where {what} should go.
        </p>
        {playlists.length === 0 ? (
          <p className="mt-4 text-[13px] text-ink-2">You don't have any playlists yet.</p>
        ) : (
          <div className="-mx-2 mt-4 max-h-[50vh] space-y-0.5 overflow-y-auto">
            {playlists.map((playlist) => {
              const locked = holdsAll(playlist, tracks);
              const checked = locked || picked.has(playlist.id);
              return (
                <button
                  key={playlist.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  disabled={locked}
                  onClick={() => toggle(playlist.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left enabled:hover:bg-ink-1/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-safe:transition-colors"
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                      checked ? "border-accent bg-accent text-on-accent" : "border-ink-1/30"
                    } ${locked ? "opacity-60" : ""}`}
                  >
                    {checked && <Icon icon={Tick02Icon} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-ink-1">{playlist.name}</span>
                    <span className="block text-[12px] text-ink-2">
                      {locked ? "Already added" : plural(tracks.length, "song", "songs")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" className="!rounded-xl" onClick={closePlaylistPicker}>
            Cancel
          </Button>
          <Button variant="primary" className="!rounded-xl" disabled={picked.size === 0} onClick={add}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

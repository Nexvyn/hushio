import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PlayListAddIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { shortTitle } from "../lib/browseText";
import { FLOAT_PANEL, FLOAT_ROW } from "../lib/floatStyle";
import { addSongsToPlaylists } from "../lib/devicePlaylists";
import { plural } from "../lib/plural";
import { type Box, placePicker, pickerMotion, PICKER_WIDTH } from "../lib/pickerLayout";
import { reducedMotion } from "../lib/motion";
import { type Playlist, useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const ITEM = "[data-picker-item]:not(:disabled)";
const ROW =
  `${FLOAT_ROW} w-full shrink-0 enabled:hover:bg-wash`;

export function PlaylistPicker() {
  const tracks = useUI((state) => state.playlistPicker);
  const anchor = useUI((state) => state.playlistPickerAnchor);
  return <AnimatePresence>{tracks && <Picker key="picker" tracks={tracks} anchor={anchor} />}</AnimatePresence>;
}

function holdsAll(playlist: Playlist, tracks: readonly Track[]): boolean {
  return tracks.every((track) => playlist.tracks.some((item) => item.id === track.id));
}

function measure(element: Element | null): Box | null {
  if (!(element instanceof HTMLElement) || !element.isConnected || element === document.body) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
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

function moveFocus(event: KeyboardEvent, panel: HTMLElement | null) {
  if (!panel) return;
  const items = Array.from(panel.querySelectorAll<HTMLElement>(ITEM));
  if (items.length === 0) return;
  event.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  const next = at === -1 ? (step === 1 ? 0 : items.length - 1) : (at + step + items.length) % items.length;
  items[next].focus();
}

function Picker({ tracks, anchor: anchorProp }: { tracks: Track[]; anchor: Box | null }) {
  const playlists = useLibrary((state) => state.playlists);
  const closePlaylistPicker = useUI((state) => state.closePlaylistPicker);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [frame] = useState(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return { opener, anchor: anchorProp ?? measure(opener) };
  });
  const [reduced] = useState(() => reducedMotion());
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    setPicked(new Set());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closePlaylistPicker();
      } else if (event.key === "Tab") {
        trapTab(event, panelRef.current);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        moveFocus(event, panelRef.current);
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

  useEffect(
    () =>
      useUI.subscribe((state, previous) => {
        if (previous.playlistPicker && !state.playlistPicker) frame.opener?.focus({ preventScroll: true });
      }),
    [frame],
  );

  function syncEdges() {
    const list = listRef.current;
    if (!list) return;
    setEdges({
      top: list.scrollTop > 2,
      bottom: list.scrollTop + list.clientHeight < list.scrollHeight - 2,
    });
  }

  useEffect(syncEdges, [playlists.length]);

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

  function createAndAdd() {
    const suggested = `Playlist ${playlists.length + 1}`;
    closePlaylistPicker();
    useUI.getState().openDialog({
      title: "New playlist",
      body: "Give your playlist a name.",
      initialValue: suggested,
      placeholder: "Playlist name",
      confirmLabel: "Create",
      onConfirm: (value) => {
        const name = value.trim() || suggested;
        const id = useLibrary.getState().createPlaylist(name);
        addSongsToPlaylists([...picked, id], tracks);
        useUI.getState().toast(`Added to ${name}`, "success");
      },
    });
  }

  const what = tracks.length === 1 ? `"${shortTitle(tracks[0].title)}"` : `${tracks.length} songs`;
  const placement = placePicker(frame.anchor, { width: window.innerWidth, height: window.innerHeight });
  const anchored = placement.mode === "anchored";
  const panelMotion = pickerMotion(reduced);
  const mask = `linear-gradient(to bottom, ${edges.top ? "transparent" : "#000"}, #000 12px, #000 calc(100% - 12px), ${edges.bottom ? "transparent" : "#000"})`;

  return (
    <div
      className={`fixed inset-0 z-[120] ${anchored ? "" : "grid place-items-center"}`}
      data-placement={anchored ? (placement.flipped ? "up" : "down") : "center"}
    >
      <div className="absolute inset-0" aria-hidden="true" onMouseDown={closePlaylistPicker} />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add to playlists"
        tabIndex={-1}
        className={`${anchored ? "absolute" : "relative"} flex max-w-[calc(100vw-16px)] flex-col gap-2 overflow-hidden ${FLOAT_PANEL} outline-none`}
        style={{
          width: PICKER_WIDTH,
          maxHeight: placement.maxHeight,
          transformOrigin: placement.origin,
          ...(placement.mode === "anchored"
            ? { left: placement.left, top: placement.top, bottom: placement.bottom }
            : {}),
        }}
        initial={panelMotion.initial}
        animate={panelMotion.animate}
        exit={panelMotion.exit}
        transition={panelMotion.transition}
      >
        <div className="px-2 pb-0.5 pt-1">
          <h2 className="text-[14px] font-semibold text-ink-1">Add to playlists</h2>
          <p className="mt-0.5 truncate text-[12px] text-ink-2">Choose where {what} should go.</p>
        </div>
        <button type="button" data-picker-item className={ROW} onClick={createAndAdd}>
          <span className="grid h-5 w-5 shrink-0 place-items-center text-ink-1">
            <Icon icon={PlayListAddIcon} />
          </span>
          New playlist
        </button>
        {playlists.length === 0 ? (
          <div className="px-2 pb-1">
            <p className="text-[13px] font-medium text-ink-1">No playlists yet</p>
            <p className="mt-0.5 text-[12px] text-ink-2">Create one to hold {what}.</p>
          </div>
        ) : (
          <div
            ref={listRef}
            onScroll={syncEdges}
            className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-0.5"
            style={{ maskImage: mask, WebkitMaskImage: mask }}
          >
            {playlists.map((playlist) => {
              const locked = holdsAll(playlist, tracks);
              const checked = locked || picked.has(playlist.id);
              return (
                <button
                  key={playlist.id}
                  type="button"
                  role="checkbox"
                  data-picker-item
                  aria-checked={checked}
                  disabled={locked}
                  onClick={() => toggle(playlist.id)}
                  className={`${ROW} disabled:cursor-default`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                      checked ? "border-accent bg-accent text-on-accent" : "border-ink-1/30"
                    } ${locked ? "opacity-60" : ""}`}
                  >
                    {checked && <Icon icon={Tick02Icon} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                  {locked && <span className="shrink-0 text-[12px] text-ink-2">Already added</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 px-1 pb-0.5 pt-1">
          <Button variant="ghost" className="!rounded-xl" onClick={closePlaylistPicker}>
            Cancel
          </Button>
          <Button variant="primary" className="!rounded-xl" disabled={picked.size === 0} onClick={add}>
            Add
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

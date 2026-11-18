import { useEffect, useRef, useState } from "react";
import { ArrowsDownUp, Check, Plus, X, XCircle, DownloadSimple, Play, MagnifyingGlass, Shuffle } from "@phosphor-icons/react";
import { ActionMenu } from "./ActionMenu";
import { Icon } from "./Icon";
import { PhoneIcon } from "./phone/PhoneIcon";
import type { MenuItem } from "../stores/ui";

export type SortKey = "custom" | "title" | "artist" | "album" | "duration" | "added";

export type SortableTrack = { title: string; artist: string; album?: string | null; duration?: number; addedAt?: number };

export type Arranged<T> = { item: T; index: number };

export const ALL_SORTS: SortKey[] = ["custom", "title", "artist", "album", "duration", "added"];
export const FILTER_MIN_TRACKS = 8;
export const ALBUM_SORTS: SortKey[] = ["custom", "title", "artist", "duration"];

const ICON_BUTTON =
  "grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)]";
const PLAY_BUTTON =
  "grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-on-accent shadow-float motion-safe:transition-[transform,opacity] hover:opacity-90 active:scale-[0.97] disabled:opacity-[var(--disabled-opacity)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const SORT_TRIGGER =
  "flex h-10 items-center gap-2 rounded-full px-3 text-meta font-medium text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function sortLabel(key: SortKey, customLabel: string): string {
  switch (key) {
    case "custom":
      return customLabel;
    case "title":
      return "Title";
    case "artist":
      return "Artist";
    case "album":
      return "Album";
    case "duration":
      return "Duration";
    case "added":
      return "Date added";
  }
}

function compareBy(sort: Exclude<SortKey, "custom">, a: SortableTrack, b: SortableTrack): number {
  const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  switch (sort) {
    case "added":
      return (b.addedAt ?? 0) - (a.addedAt ?? 0) || byTitle;
    case "title":
      return byTitle;
    case "artist":
      return a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }) || byTitle;
    case "album":
      return (a.album ?? "").localeCompare(b.album ?? "", undefined, { sensitivity: "base" }) || byTitle;
    case "duration":
      return (a.duration ?? 0) - (b.duration ?? 0);
  }
}

export function arrangeTracks<T extends SortableTrack>(tracks: T[], query: string, sort: SortKey): Arranged<T>[] {
  const needle = query.trim().toLowerCase();
  const rows = tracks
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !needle || item.title.toLowerCase().includes(needle) || item.artist.toLowerCase().includes(needle));
  if (sort === "custom") return rows;
  return rows.sort((a, b) => compareBy(sort, a.item, b.item));
}

type CollectionActionsProps = {
  playLabel: string;
  disabled: boolean;
  onPlay: () => void;
  onShuffle?: () => void;
  onDownload?: () => void;
  saved?: boolean;
  onToggleSaved?: () => void;
  menu?: MenuItem[];
};

export function CollectionActions({ playLabel, disabled, onPlay, onShuffle, onDownload, saved = false, onToggleSaved, menu }: CollectionActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={playLabel} title="Play" disabled={disabled} onClick={onPlay} className={`${PLAY_BUTTON} mr-2`}>
        <Icon icon={Play} fill="currentColor" />
      </button>
      {onShuffle && (
        <button type="button" aria-label="Shuffle" title="Shuffle" disabled={disabled} onClick={onShuffle} className={ICON_BUTTON}>
          <Icon icon={Shuffle} />
        </button>
      )}
      {onToggleSaved && (
        <button
          type="button"
          aria-label={saved ? "Remove from Your Library" : "Save to Your Library"}
          title={saved ? "Remove from Your Library" : "Save to Your Library"}
          disabled={disabled}
          onClick={onToggleSaved}
          className={ICON_BUTTON}
        >
          <Icon icon={saved ? Check : Plus} />
        </button>
      )}
      {onDownload && (
        <button type="button" aria-label="Download" title="Download" disabled={disabled} onClick={onDownload} className={ICON_BUTTON}>
          <Icon icon={DownloadSimple} />
        </button>
      )}
      {menu && <ActionMenu items={menu} label="More options" triggerClass={ICON_BUTTON} />}
    </div>
  );
}

type TrackToolsProps = {
  query: string;
  onQuery: (value: string) => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  customLabel?: string;
  options?: SortKey[];
  filterable?: boolean;
};

export function PhoneTrackFilter({ query, onQuery, count }: { query: string; onQuery: (value: string) => void; count: number }) {
  if (count < FILTER_MIN_TRACKS) return null;
  return (
    <div className="relative mb-4">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2">
        <PhoneIcon icon={MagnifyingGlass} />
      </span>
      <input
        type="search"
        aria-label="Filter this list"
        placeholder="Filter this list"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className="h-11 w-full rounded-[12px] bg-wash pl-11 pr-11 text-body text-ink-1 placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => onQuery("")}
          className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-ink-2 active:bg-pressed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <PhoneIcon icon={XCircle} />
        </button>
      )}
    </div>
  );
}

export function TrackTools({
  query,
  onQuery,
  sort,
  onSort,
  customLabel = "Custom order",
  options = ALL_SORTS,
  filterable = true,
}: TrackToolsProps) {
  const [open, setOpen] = useState(query.length > 0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    onQuery("");
    setOpen(false);
  };

  const sortItems: MenuItem[] = options.map((key) => ({
    label: sortLabel(key, customLabel),
    checked: key === sort,
    onSelect: () => onSort(key),
  }));

  return (
    <div className="flex items-center gap-2">
      {filterable && (
        <div
          className={`flex h-10 items-center overflow-hidden rounded-full focus-within:ring-2 focus-within:ring-focus ${
            open ? "animate-fade-in w-56 bg-wash pl-3" : "w-10"
          }`}
        >
          {open && (
            <input
              ref={inputRef}
              type="search"
              aria-label="Filter this list"
              placeholder="Filter this list"
              spellCheck={false}
              autoComplete="off"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") close();
              }}
              className="min-w-0 flex-1 bg-transparent text-meta text-ink-1 placeholder:text-ink-3 focus-visible:outline-none"
            />
          )}
          {open && query && (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => {
                onQuery("");
                inputRef.current?.focus();
              }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Icon icon={XCircle} />
            </button>
          )}
          <button
            type="button"
            aria-label={open ? "Close filter" : "Filter this list"}
            aria-expanded={open}
            onClick={() => (open ? close() : setOpen(true))}
            className={ICON_BUTTON}
          >
            <Icon icon={open ? X : MagnifyingGlass} />
          </button>
        </div>
      )}
      <ActionMenu
        items={sortItems}
        label="Sort songs"
        icon={ArrowsDownUp}
        triggerText={sortLabel(sort, customLabel)}
        triggerClass={SORT_TRIGGER}
      />
    </div>
  );
}

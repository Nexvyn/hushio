import { useMemo, useRef, useState } from "react";
import { CaretDown, CaretLeft, CaretRight, DownloadSimple, Heart, Folder, Books, ListBullets, MusicNote, MusicNotes, Rows, PushPin, Playlist, Plus, MagnifyingGlass, SquaresFour, User, VinylRecord, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { ActionMenu } from "./ActionMenu";
import { t, useT, type TKey } from "../lib/i18n";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Icon } from "./Icon";
import type { SidebarMode } from "../lib/layoutTier";
import { libraryRows, type RowEntry, type SingleRow } from "../lib/collections";
import { playlistCovers } from "../lib/playlistCover";
import { browseMenuItems } from "../lib/browseActions";
import {
  artistRowMenuItems,
  createMenuItems,
  dropPlaylistOnFolder,
  folderMenuItems,
  panelMenuItems,
  pinnedSingleMenuItems,
  playlistMenuItems,
} from "../lib/collectionActions";
import { moveKey } from "../lib/libraryOrder";
import { LIBRARY_SORTS, type LibrarySort, sortLibraryRows } from "../lib/librarySort";
import { useRovingKeys } from "../lib/useRovingKeys";
import { plural } from "../lib/plural";
import { useSortable } from "../lib/useSortable";
import { type PinnedSingles, useLibrary } from "../stores/library";
import { useRecentItems } from "../stores/recents";
import { useFailedCovers } from "../stores/coverErrors";
import { type View, useNavigation } from "../stores/navigation";
import { SIDEBAR_LAYOUTS, type SidebarLayout, useSettings } from "../stores/settings";
import { type MenuItem, useUI } from "../stores/ui";
import { useImageReveal } from "./useImageReveal";

function SidebarThumb({ src }: { src: string }) {
  const reveal = useImageReveal(src);
  return <img loading="lazy" decoding="async" src={src} alt="" onLoad={reveal.onLoad} className={`h-full w-full object-cover ${reveal.className}`} />;
}

const SINGLE_INFO: Record<SingleRow, { labelKey: TKey; icon: PhosphorIcon; view: View }> = {
  liked: { labelKey: "nav.liked", icon: Heart, view: { name: "library", param: "liked" } },
  spotify: { labelKey: "nav.import", icon: MusicNotes, view: { name: "import" } },
  downloads: { labelKey: "nav.downloads", icon: DownloadSimple, view: { name: "downloads" } },
  local: { labelKey: "nav.local", icon: MusicNote, view: { name: "local" } },
};

const VIEW_OPTIONS: Record<SidebarLayout, { labelKey: TKey; icon: PhosphorIcon }> = {
  compact: { labelKey: "view.compact", icon: Rows },
  list: { labelKey: "view.list", icon: ListBullets },
  grid: { labelKey: "view.grid", icon: SquaresFour },
};

const SINGLE_SUBTITLE: Record<SingleRow, string> = {
  liked: "",
  spotify: "Connect your playlists",
  downloads: "",
  local: "On this device",
};

type RowInfo = { title: string; subtitle: string; view: View; icon: PhosphorIcon; thumb: string | null; round: boolean };
type RowCounts = { liked: number; downloaded: number };
type FailedCovers = Readonly<Record<string, true>>;

function countSubtitle(count: number): string {
  return count > 0 ? `Playlist · ${plural(count, "song", "songs")}` : "Playlist";
}

function describe(entry: RowEntry, counts: RowCounts, failed: FailedCovers): RowInfo {
  switch (entry.kind) {
    case "single": {
      const info = SINGLE_INFO[entry.single];
      let subtitle = SINGLE_SUBTITLE[entry.single];
      if (entry.single === "liked") subtitle = plural(counts.liked, "song", "songs");
      if (entry.single === "downloads") subtitle = `${plural(counts.downloaded, "song", "songs")} · Downloaded`;
      return { title: t(info.labelKey), subtitle, view: info.view, icon: info.icon, thumb: null, round: false };
    }
    case "playlist":
      return {
        title: entry.playlist.name,
        subtitle: countSubtitle(entry.playlist.tracks.length),
        view: { name: "playlist", param: entry.playlist.id },
        icon: Playlist,
        thumb: playlistCovers(entry.playlist, 1, failed)[0] ?? null,
        round: false,
      };
    case "folder":
      return {
        title: entry.folder.name,
        subtitle: `Folder · ${plural(entry.count, "playlist", "playlists")}`,
        view: { name: "folder", param: entry.folder.id },
        icon: Folder,
        thumb: null,
        round: false,
      };
    case "artist":
      return {
        title: entry.artist.name,
        subtitle: "Artist",
        view: { name: "artist", param: entry.artist.id },
        icon: User,
        thumb: entry.artist.thumb ?? null,
        round: true,
      };
    case "album":
      return {
        title: entry.album.title,
        subtitle: ["Album", entry.album.artist].filter(Boolean).join(" · "),
        view: { name: "album", param: entry.album.id },
        icon: VinylRecord,
        thumb: entry.album.thumb ?? null,
        round: false,
      };
  }
}

function dropTargetOf(entry: RowEntry): string | undefined {
  switch (entry.kind) {
    case "playlist":
      return `playlist:${entry.playlist.id}`;
    case "folder":
      return `folder:${entry.folder.id}`;
    case "single":
      return entry.single === "liked" ? "liked" : undefined;
    case "artist":
    case "album":
      return undefined;
  }
}

function rowMenu(entry: RowEntry, pinnedSingles: PinnedSingles): MenuItem[] {
  switch (entry.kind) {
    case "single":
      return pinnedSingleMenuItems(entry.single, pinnedSingles[entry.single]);
    case "playlist":
      return playlistMenuItems(entry.playlist);
    case "folder":
      return folderMenuItems(entry.folder.id);
    case "artist":
      return artistRowMenuItems(entry.artist);
    case "album":
      return browseMenuItems({
        type: "album",
        browseId: entry.album.id,
        title: entry.album.title,
        subtitle: entry.album.artist,
        thumb: entry.album.thumb ?? null,
      });
  }
}

function isOpen(view: View, target: View): boolean {
  return view.name === target.name && (target.param === undefined || view.param === target.param);
}

const ROW_FOCUS =
  "w-full rounded-control text-left motion-safe:transition-shadow motion-safe:duration-fade focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[drop-hover=true]:bg-ink-1/[0.1] data-[drop-hover=true]:ring-2 data-[drop-hover=true]:ring-accent";
const ROW_CLASS = `h-[52px] ${ROW_FOCUS}`;
const COMPACT_ROW_CLASS = `h-9 ${ROW_FOCUS}`;
const GRID_ROW_CLASS = `flex flex-col gap-1.5 p-1.5 ${ROW_FOCUS}`;
const GRID_LIST_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-2 gap-y-3";
const ICON_BUTTON =
  "hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const SORT_TRIGGER =
  "flex h-8 shrink-0 flex-row-reverse items-center gap-0.5 rounded-control px-1 text-meta font-medium text-ink-2 hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function Sidebar({ mode = "full" }: { mode?: SidebarMode }) {
  const libraryRef = useRef<HTMLElement>(null);
  useRovingKeys(libraryRef, "button:not([disabled])", "vertical");
  const view = useNavigation((state) => state.view);
  const navigate = useNavigation((state) => state.navigate);
  useT();
  const playlists = useLibrary((state) => state.playlists);
  const folders = useLibrary((state) => state.folders);
  const followedArtists = useLibrary((state) => state.followedArtists);
  const savedAlbums = useLibrary((state) => state.savedAlbums);
  const pinnedSingles = useLibrary((state) => state.pinnedSingles);
  const libraryOrder = useLibrary((state) => state.libraryOrder);
  const likedCount = useLibrary((state) => state.liked.length);
  const downloadedCount = useLibrary((state) => Object.values(state.downloads).filter((item) => item.status === "done").length);
  const recentItems = useRecentItems((state) => state.items);
  const counts: RowCounts = { liked: likedCount, downloaded: downloadedCount };
  const failed = useFailedCovers();
  const setLibraryOrder = useLibrary((state) => state.setLibraryOrder);
  const sidebarLayout = useSettings((state) => state.sidebarLayout);
  const setSetting = useSettings((state) => state.setValue);
  const libraryCollapsed = useUI((state) => state.libraryCollapsed);
  const setLibraryCollapsed = useUI((state) => state.setLibraryCollapsed);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("recents");
  const listRef = useRef<HTMLUListElement>(null);
  const expandable = mode === "full";
  const rail = mode === "rail" || libraryCollapsed;
  const gridView = !rail && sidebarLayout === "grid";
  const compactView = !rail && sidebarLayout === "compact";
  const needle = query.trim().toLowerCase();

  const { fixed, movable, tail } = useMemo(() => {
    const rows = libraryRows({ playlists, folders, followedArtists, savedAlbums, pinnedSingles, libraryOrder });
    const shown = (entry: RowEntry) => !(entry.kind === "single" && entry.single === "spotify");
    const importRow = [...rows.fixed, ...rows.movable].find((entry) => entry.kind === "single" && entry.single === "spotify");
    return { fixed: rows.fixed.filter(shown), movable: rows.movable.filter(shown), tail: importRow };
  }, [playlists, folders, followedArtists, savedAlbums, pinnedSingles, libraryOrder]);

  const keep = (entry: RowEntry) => !needle || describe(entry, counts, failed).title.toLowerCase().includes(needle);
  const visibleFixed = fixed.filter(keep);
  const recentIndex = useMemo(
    () => new Map(recentItems.map((item, index) => [`${item.kind}:${item.id}`, index])),
    [recentItems],
  );
  const playlistIndex = useMemo(() => new Map(playlists.map((item, index) => [item.id, index])), [playlists]);
  const visibleMovable = sortLibraryRows(movable.filter(keep), sort, recentIndex, playlistIndex);
  const visibleTail = tail && keep(tail) ? tail : undefined;

  const movableKeys = movable.map((entry) => entry.key);
  const visibleKeys = visibleMovable.map((entry) => entry.key);
  const sortable = useSortable({
    keys: visibleKeys,
    listRef,
    onMove: (from, to) => {
      const source = movableKeys.indexOf(visibleKeys[from]);
      const target = movableKeys.indexOf(visibleKeys[to]);
      if (source >= 0 && target >= 0) setLibraryOrder(moveKey(movableKeys, source, target));
    },
    canDropOn: (key, targetId) => key.startsWith("playlist:") && targetId.startsWith("folder:"),
    onDropOn: (key, targetId) =>
      dropPlaylistOnFolder(key.slice("playlist:".length), targetId.slice("folder:".length)),
  });

  const sortLabel = LIBRARY_SORTS.find((option) => option.id === sort)?.label ?? "Recents";
  const sortItems: MenuItem[] = [
    { label: t("sidebar.sortBy"), header: true },
    ...LIBRARY_SORTS.map((option) => ({
      label: option.label,
      checked: option.id === sort,
      onSelect: () => setSort(option.id),
    })),
  ];

  const viewItems: MenuItem[] = [
    { label: t("sidebar.viewAs"), header: true },
    ...SIDEBAR_LAYOUTS.map((id) => ({
      label: t(VIEW_OPTIONS[id].labelKey),
      checked: id === sidebarLayout,
      onSelect: () => setSetting("sidebarLayout", id),
    })),
  ];

  function closeSearch() {
    setQuery("");
    setSearching(false);
  }

  function renderRow(entry: RowEntry, pinned: boolean) {
    const info = describe(entry, counts, failed);
    const current = isOpen(view, info.view);
    const bound = sortable.bind(entry.key);
    const menu = rowMenu(entry, pinnedSingles);
    const liked = entry.kind === "single" && entry.single === "liked";
    const art = info.thumb ? (
      <SidebarThumb src={info.thumb} />
    ) : (
      <Icon icon={info.icon} fill={liked ? "currentColor" : "none"} />
    );
    const artClass = `flex items-center justify-center overflow-hidden ${
      gridView ? "aspect-square w-full" : "h-11 w-11 shrink-0"
    } ${liked ? "bg-accent text-on-accent [corner-shape:squircle]" : "bg-wash text-ink-2"} ${info.round ? "rounded-full" : "rounded-control"}`;
    const hover = current ? "bg-ink-1/[0.08]" : "hover:bg-ink-1/[0.05] active:bg-ink-1/[0.1]";
    const pinMark = pinned && (
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-2">
        <Icon icon={PushPin} />
      </span>
    );
    const buttonClass = rail
      ? `${ROW_CLASS} flex items-center justify-center gap-3 ${hover}`
      : gridView
        ? `${GRID_ROW_CLASS} ${hover}`
        : compactView
          ? `${COMPACT_ROW_CLASS} flex items-center px-2 ${hover}`
          : `${ROW_CLASS} flex items-center gap-3 px-2 ${hover}`;
    return (
      <li key={entry.key}>
        <button
          type="button"
          {...bound}
          onContextMenu={(event) => openMenuAtPointer(event, menu)}
          onKeyDown={(event) => {
            if (!openMenuFromKey(event, menu)) bound.onKeyDown(event);
          }}
          data-drop-target={dropTargetOf(entry)}
          aria-current={current ? "page" : undefined}
          aria-label={rail ? info.title : undefined}
          title={rail ? info.title : undefined}
          onClick={() => navigate(info.view)}
          className={buttonClass}
        >
          {compactView ? (
            <>
              <span className="block min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-ink-1">{info.title}</span>
              {pinMark}
            </>
          ) : gridView ? (
            <>
              <span className={artClass}>{art}</span>
              <span className="flex w-full min-w-0 items-center gap-1">
                <span className="block min-w-0 flex-1 truncate text-[13px] font-semibold leading-5 text-ink-1">{info.title}</span>
                {pinMark}
              </span>
              <span className="block w-full truncate text-meta text-ink-2">{info.subtitle}</span>
            </>
          ) : (
            <>
              <span className={artClass}>{art}</span>
              {!rail && (
                <>
                  <span className="bt-label-in flex min-w-0 flex-1 flex-col justify-center">
                    <span className="block truncate text-[14px] font-semibold leading-5 text-ink-1">{info.title}</span>
                    <span className="mt-0.5 block truncate text-meta text-ink-2">{info.subtitle}</span>
                  </span>
                  {pinMark}
                </>
              )}
            </>
          )}
        </button>
      </li>
    );
  }

  return (
    <aside
      className={`shell-sidebar flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[8px] bg-surface ${rail ? "w-16" : "w-[272px]"}`}
      onContextMenu={(event) => openMenuAtPointer(event, panelMenuItems())}
    >
      <section aria-label={t("nav.library")} className="flex min-h-0 flex-1 flex-col pt-2">
        <div className={`flex shrink-0 items-center gap-2 ${rail ? "h-auto flex-col px-2 pt-2" : "h-10 pl-4 pr-2.5"}`}>
          <button
            type="button"
            onClick={() => navigate({ name: "library" })}
            aria-label={rail ? t("nav.library") : undefined}
            title={rail ? t("nav.library") : undefined}
            className={`rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
              rail ? "flex items-center justify-center p-1 text-ink-2 hover:text-ink-1" : "min-w-0 truncate text-[15px] font-semibold text-ink-1"
            }`}
          >
            {rail ? <Icon icon={Books} /> : <span className="bt-label-in">{t("nav.library")}</span>}
          </button>
          <div className={`flex items-center gap-1 ${rail ? "" : "ml-auto"}`}>
            {!rail && (
              <ActionMenu items={createMenuItems()} label="Create" icon={Plus} triggerClass={ICON_BUTTON} />
            )}
            {expandable && (
              <button
                type="button"
                onClick={() => setLibraryCollapsed(!libraryCollapsed)}
                aria-label={rail ? "Expand your library" : "Collapse your library"}
                aria-expanded={!rail}
                title={rail ? "Expand your library" : "Collapse your library"}
                className={ICON_BUTTON}
              >
                <Icon icon={rail ? CaretRight : CaretLeft} />
              </button>
            )}
          </div>
        </div>

        {!rail && searching && (
          <div className="flex h-9 shrink-0 items-center px-4">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3">
                <Icon icon={MagnifyingGlass} />
              </span>
              <input
                type="search"
                autoFocus
                aria-label="Search your library"
                placeholder="Search your library"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeSearch();
                }}
                onBlur={() => {
                  if (!query.trim()) setSearching(false);
                }}
                className="h-8 w-full rounded-full border-0 bg-wash pl-8 pr-3 text-meta text-ink-1 placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            </div>
          </div>
        )}

        {!rail && (
          <div className="flex h-9 shrink-0 items-center gap-1 pl-2.5 pr-2.5">
            {!searching && (
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label="Search your library"
                title="Search your library"
                className={ICON_BUTTON}
              >
                <Icon icon={MagnifyingGlass} />
              </button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <ActionMenu
                items={sortItems}
                label={`Sort library, ${sortLabel}`}
                icon={CaretDown}
                triggerText={sortLabel}
                triggerClass={SORT_TRIGGER}
              />
              <ActionMenu items={viewItems} label="Library view" icon={VIEW_OPTIONS[sidebarLayout].icon} triggerClass={ICON_BUTTON} />
            </div>
          </div>
        )}

        <nav
          ref={libraryRef}
          aria-label="Library"
          className={`no-scrollbar min-h-0 flex-1 overflow-y-auto pt-1 ${rail ? "px-1" : "px-2"}`}
        >
          <ul ref={listRef} className={`${gridView ? GRID_LIST_CLASS : "space-y-1"} pb-2`} {...sortable.listProps}>
            {visibleFixed.map((entry) => renderRow(entry, true))}
            {visibleMovable.map((entry) => renderRow(entry, false))}
            {visibleTail && renderRow(visibleTail, pinnedSingles.spotify)}
          </ul>
        </nav>
      </section>
    </aside>
  );
}

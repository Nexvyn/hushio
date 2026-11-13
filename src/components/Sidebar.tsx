import { useMemo, useRef } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ChartLineData01Icon,
  Download01Icon,
  FavouriteIcon,
  Folder01Icon,
  LibraryIcon,
  MusicNote01Icon,
  MusicNote03Icon,
  PinIcon,
  PlayListIcon,
  PlusSignIcon,
  SparklesIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Icon } from "./Icon";
import type { SidebarMode } from "../lib/layoutTier";
import { coversOf, libraryRows, type RowEntry, type SingleRow } from "../lib/collections";
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
import { useRovingKeys } from "../lib/useRovingKeys";
import { plural } from "../lib/plural";
import { useSortable } from "../lib/useSortable";
import { type PinnedSingles, useLibrary } from "../stores/library";
import { type View, useNavigation } from "../stores/navigation";
import type { MenuItem } from "../stores/ui";

const SINGLE_INFO: Record<SingleRow, { label: string; icon: IconSvgElement; view: View }> = {
  liked: { label: "Liked Songs", icon: FavouriteIcon, view: { name: "library", param: "liked" } },
  spotify: { label: "Import", icon: MusicNote03Icon, view: { name: "import" } },
  downloads: { label: "Downloads", icon: Download01Icon, view: { name: "downloads" } },
  local: { label: "Local music", icon: MusicNote01Icon, view: { name: "local" } },
};

const DISCOVER: { label: string; icon: IconSvgElement; view: View }[] = [
  { label: "Charts", icon: ChartLineData01Icon, view: { name: "charts" } },
  { label: "New releases", icon: SparklesIcon, view: { name: "newreleases" } },
];

const SINGLE_SUBTITLE: Record<SingleRow, string> = {
  liked: "",
  spotify: "Connect your playlists",
  downloads: "Playlist · 0 songs",
  local: "On this device",
};

type RowInfo = { title: string; subtitle: string; view: View; icon: IconSvgElement; thumb: string | null; round: boolean };

function describe(entry: RowEntry, likedCount: number): RowInfo {
  switch (entry.kind) {
    case "single": {
      const info = SINGLE_INFO[entry.single];
      const subtitle =
        entry.single === "liked" ? `Playlist · ${plural(likedCount, "song", "songs")}` : SINGLE_SUBTITLE[entry.single];
      return { title: info.label, subtitle, view: info.view, icon: info.icon, thumb: null, round: false };
    }
    case "playlist":
      return {
        title: entry.playlist.name,
        subtitle: `Playlist · ${plural(entry.playlist.tracks.length, "song", "songs")}`,
        view: { name: "playlist", param: entry.playlist.id },
        icon: PlayListIcon,
        thumb: coversOf(entry.playlist.tracks, 1)[0] ?? null,
        round: false,
      };
    case "folder":
      return {
        title: entry.folder.name,
        subtitle: `Folder · ${plural(entry.count, "playlist", "playlists")}`,
        view: { name: "folder", param: entry.folder.id },
        icon: Folder01Icon,
        thumb: null,
        round: false,
      };
    case "artist":
      return {
        title: entry.artist.name,
        subtitle: "Artist",
        view: { name: "artist", param: entry.artist.id },
        icon: UserIcon,
        thumb: entry.artist.thumb ?? null,
        round: true,
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
  }
}

function isOpen(view: View, target: View): boolean {
  return view.name === target.name && (target.param === undefined || view.param === target.param);
}

export function Sidebar({ mode = "full" }: { mode?: SidebarMode }) {
  const navRef = useRef<HTMLElement>(null);
  useRovingKeys(navRef, "button:not([disabled])", "vertical");
  const view = useNavigation((state) => state.view);
  const navigate = useNavigation((state) => state.navigate);
  const playlists = useLibrary((state) => state.playlists);
  const folders = useLibrary((state) => state.folders);
  const followedArtists = useLibrary((state) => state.followedArtists);
  const pinnedSingles = useLibrary((state) => state.pinnedSingles);
  const libraryOrder = useLibrary((state) => state.libraryOrder);
  const likedCount = useLibrary((state) => state.liked.length);
  const setLibraryOrder = useLibrary((state) => state.setLibraryOrder);
  const listRef = useRef<HTMLUListElement>(null);
  const rail = mode === "rail";

  const { fixed, movable, tail } = useMemo(() => {
    const rows = libraryRows({ playlists, folders, followedArtists, pinnedSingles, libraryOrder });
    const shown = (entry: RowEntry) => !(entry.kind === "single" && entry.single === "spotify");
    const importRow = [...rows.fixed, ...rows.movable].find((entry) => entry.kind === "single" && entry.single === "spotify");
    return { fixed: rows.fixed.filter(shown), movable: rows.movable.filter(shown), tail: importRow };
  }, [playlists, folders, followedArtists, pinnedSingles, libraryOrder]);

  const movableKeys = movable.map((entry) => entry.key);
  const sortable = useSortable({
    keys: movableKeys,
    listRef,
    onMove: (from, to) => setLibraryOrder(moveKey(movableKeys, from, to)),
    canDropOn: (key, targetId) => key.startsWith("playlist:") && targetId.startsWith("folder:"),
    onDropOn: (key, targetId) =>
      dropPlaylistOnFolder(key.slice("playlist:".length), targetId.slice("folder:".length)),
  });

  function renderRow(entry: RowEntry, pinned: boolean) {
    const info = describe(entry, likedCount);
    const current = isOpen(view, info.view);
    const bound = sortable.bind(entry.key);
    const menu = rowMenu(entry, pinnedSingles);
    const art = info.thumb ? (
      <img src={info.thumb} alt="" className="h-full w-full object-cover" />
    ) : (
      <Icon icon={info.icon} />
    );
    const artClass = `flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-ink-2 ${
      info.round ? "rounded-full" : "rounded-control"
    }`;
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
          className={`flex w-full items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[drop-hover=true]:bg-ink-1/[0.1] ${
            rail ? "h-14 justify-center" : "h-14 px-3"
          } ${current ? "bg-ink-1/[0.08]" : "hover:bg-ink-1/[0.05] active:bg-ink-1/[0.1]"}`}
        >
          <span className={artClass}>{art}</span>
          {!rail && (
            <>
              <span className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="block truncate text-body font-semibold text-ink-1">{info.title}</span>
                <span className="mt-0.5 block truncate text-meta text-ink-2">{info.subtitle}</span>
              </span>
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-2">
                {pinned && <Icon icon={PinIcon} />}
              </span>
            </>
          )}
        </button>
      </li>
    );
  }

  return (
    <aside
      className={`shell-sidebar flex shrink-0 flex-col rounded-[10px] bg-surface ${rail ? "w-16" : "w-[280px]"}`}
      onContextMenu={(event) => openMenuAtPointer(event, panelMenuItems())}
    >
      <div className={`flex h-12 items-center gap-2 ${rail ? "justify-center px-2" : "px-5"}`}>
        <button
          type="button"
          onClick={() => navigate({ name: "library" })}
          aria-label={rail ? "Your Library" : undefined}
          title={rail ? "Your Library" : undefined}
          className={`flex items-center gap-3 text-body font-semibold text-ink-2 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
            rail ? "rounded-control p-1" : "rounded-control"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <Icon icon={LibraryIcon} />
          </span>
          {!rail && "Your Library"}
        </button>
        {!rail && (
          <div className="ml-auto flex">
            <ActionMenu
              items={createMenuItems()}
              label="Create"
              icon={PlusSignIcon}
              triggerClass="hit-area flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] [corner-shape:squircle] text-ink-2 hover:bg-hover hover:text-ink-1 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
        )}
      </div>

      <nav
        ref={navRef}
        aria-label="Library"
        className={`no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2 pt-1 ${rail ? "px-1" : "px-2"}`}
      >
        <ul ref={listRef} className="space-y-1" {...sortable.listProps}>
          {DISCOVER.map((item) => {
            const current = isOpen(view, item.view);
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => navigate(item.view)}
                  aria-current={current ? "page" : undefined}
                  aria-label={rail ? item.label : undefined}
                  title={rail ? item.label : undefined}
                  className={`flex w-full items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    rail ? "h-14 justify-center" : "h-14 px-3"
                  } ${current ? "bg-ink-1/[0.08]" : "hover:bg-ink-1/[0.05] active:bg-ink-1/[0.1]"}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center text-ink-2">
                    <Icon icon={item.icon} />
                  </span>
                  {!rail && <span className="block truncate text-body font-semibold text-ink-1">{item.label}</span>}
                </button>
              </li>
            );
          })}
          {fixed.map((entry) => renderRow(entry, true))}
          {movable.map((entry) => renderRow(entry, false))}
          {tail && renderRow(tail, pinnedSingles.spotify)}
        </ul>
      </nav>
    </aside>
  );
}

import { useMemo, useRef } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Download01Icon,
  FavouriteIcon,
  Folder01Icon,
  LibraryIcon,
  MusicNote01Icon,
  MusicNote03Icon,
  PinIcon,
  PlayListIcon,
  PlusSignIcon,
  ReplayIcon,
  Settings02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { openMenuAtPointer, openMenuFromKey } from "./ContextMenu";
import { Icon } from "./Icon";
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
import { plural } from "../lib/plural";
import { useSortable } from "../lib/useSortable";
import { type PinnedSingles, useLibrary } from "../stores/library";
import { type View, useNavigation } from "../stores/navigation";
import type { MenuItem } from "../stores/ui";

const SINGLE_INFO: Record<SingleRow, { label: string; icon: IconSvgElement; view: View }> = {
  liked: { label: "Liked Songs", icon: FavouriteIcon, view: { name: "library", param: "liked" } },
  spotify: { label: "Import", icon: MusicNote03Icon, view: { name: "import" } },
  replay: { label: "Replay", icon: ReplayIcon, view: { name: "replay" } },
  downloads: { label: "Downloads", icon: Download01Icon, view: { name: "downloads" } },
  local: { label: "Local music", icon: MusicNote01Icon, view: { name: "local" } },
};

const SINGLE_SUBTITLE: Record<SingleRow, string> = {
  liked: "",
  spotify: "Connect your playlists",
  replay: "Your listening stats",
  downloads: "Playlist · 0 tracks",
  local: "On this device",
};

type RowInfo = { title: string; subtitle: string; view: View; icon: IconSvgElement; thumb: string | null; round: boolean };

function describe(entry: RowEntry, likedCount: number): RowInfo {
  switch (entry.kind) {
    case "single": {
      const info = SINGLE_INFO[entry.single];
      const subtitle =
        entry.single === "liked" ? `Playlist · ${plural(likedCount, "track", "tracks")}` : SINGLE_SUBTITLE[entry.single];
      return { title: info.label, subtitle, view: info.view, icon: info.icon, thumb: null, round: false };
    }
    case "playlist":
      return {
        title: entry.playlist.name,
        subtitle: `Playlist · ${plural(entry.playlist.tracks.length, "track", "tracks")}`,
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

export function Sidebar() {
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

  const { fixed, movable } = useMemo(
    () => libraryRows({ playlists, folders, followedArtists, pinnedSingles, libraryOrder }),
    [playlists, folders, followedArtists, pinnedSingles, libraryOrder],
  );

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
          onClick={() => navigate(info.view)}
          className={`flex w-full items-center gap-3 rounded-[9px] p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[drop-hover=true]:bg-ink-1/[0.1] ${
            current ? "bg-ink-1/[0.08]" : "hover:bg-ink-1/[0.05] active:bg-ink-1/[0.1]"
          }`}
        >
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-ink-1/[0.06] text-ink-2 ${
              info.round ? "rounded-full" : "rounded-[9px]"
            }`}
          >
            {info.thumb ? <img src={info.thumb} alt="" className="h-full w-full object-cover" /> : <Icon icon={info.icon} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink-1">{info.title}</span>
            <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{info.subtitle}</span>
          </span>
          {pinned && (
            <span aria-hidden="true" className="text-ink-2">
              <Icon icon={PinIcon} />
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <aside
      className="shell-sidebar flex w-[328px] shrink-0 flex-col"
      onContextMenu={(event) => openMenuAtPointer(event, panelMenuItems())}
    >
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate({ name: "library" })}
          className="flex items-center gap-2 text-[14px] font-semibold text-ink-2 hover:text-ink-1"
        >
          <Icon icon={LibraryIcon} />
          Your Library
        </button>
        <div className="ml-auto">
          <ActionMenu items={createMenuItems()} label="Create" icon={PlusSignIcon} />
        </div>
      </div>

      <nav aria-label="Library" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        <ul ref={listRef} className="space-y-0.5" {...sortable.listProps}>
          {fixed.map((entry) => renderRow(entry, true))}
          {movable.map((entry) => renderRow(entry, false))}
        </ul>
      </nav>

      <div className="px-2 pb-2">
        <button
          type="button"
          aria-current={view.name === "settings" ? "page" : undefined}
          onClick={() => navigate({ name: "settings" })}
          className={`flex w-full items-center gap-3 rounded-[9px] p-2 text-left text-[14px] font-semibold ${
            view.name === "settings"
              ? "bg-ink-1/[0.08] text-ink-1"
              : "text-ink-2 hover:bg-ink-1/[0.05] hover:text-ink-1"
          }`}
        >
          <Icon icon={Settings02Icon} />
          Settings
        </button>
      </div>
    </aside>
  );
}

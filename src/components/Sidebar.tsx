import { useEffect, useMemo, useRef } from "react";
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
import { Icon } from "./Icon";
import { coversOf, libraryRows, type RowEntry, type SingleRow } from "../lib/collections";
import { createMenuItems } from "../lib/collectionActions";
import { moveKey } from "../lib/libraryOrder";
import { plural } from "../lib/plural";
import { useLibrary } from "../stores/library";
import { type View, useNavigation } from "../stores/navigation";

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
  const focusKey = useRef<string | null>(null);

  const { fixed, movable } = useMemo(
    () => libraryRows({ playlists, folders, followedArtists, pinnedSingles, libraryOrder }),
    [playlists, folders, followedArtists, pinnedSingles, libraryOrder],
  );

  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-row-key]") ?? []).find(
      (item) => item.dataset.rowKey === key,
    );
    row?.focus();
  });

  function moveRow(key: string, direction: -1 | 1) {
    const keys = movable.map((entry) => entry.key);
    const from = keys.indexOf(key);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= keys.length) return;
    focusKey.current = key;
    setLibraryOrder(moveKey(keys, from, to));
  }

  function renderRow(entry: RowEntry, pinned: boolean) {
    const info = describe(entry, likedCount);
    const current = isOpen(view, info.view);
    return (
      <li key={entry.key}>
        <button
          type="button"
          data-row-key={entry.key}
          aria-current={current ? "page" : undefined}
          onClick={() => navigate(info.view)}
          onKeyDown={(event) => {
            if (pinned || !event.altKey) return;
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            moveRow(entry.key, event.key === "ArrowUp" ? -1 : 1);
          }}
          className={`flex w-full items-center gap-3 rounded-[9px] p-2 text-left motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
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
    <aside className="shell-sidebar flex w-[328px] shrink-0 flex-col">
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <button
          type="button"
          onClick={() => navigate({ name: "library" })}
          className="flex items-center gap-2 text-[14px] font-semibold text-ink-2 transition-colors hover:text-ink-1"
        >
          <Icon icon={LibraryIcon} />
          Your Library
        </button>
        <div className="ml-auto">
          <ActionMenu items={createMenuItems()} label="Create" icon={PlusSignIcon} />
        </div>
      </div>

      <nav aria-label="Library" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-1">
        <ul ref={listRef} className="space-y-0.5">
          {fixed.map((entry) => renderRow(entry, true))}
          {movable.map((entry) => renderRow(entry, false))}
        </ul>
      </nav>

      <div className="px-2 pb-2">
        <button
          type="button"
          aria-current={view.name === "settings" ? "page" : undefined}
          onClick={() => navigate({ name: "settings" })}
          className={`flex w-full items-center gap-3 rounded-[9px] p-2 text-left text-[14px] font-semibold transition-colors ${
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

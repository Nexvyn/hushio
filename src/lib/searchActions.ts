import { X, MagnifyingGlass } from "@phosphor-icons/react";
import { APP_NAME } from "./app";
import type { BrowseItem, SuggestionRow } from "./searchParse";
import { useNavigation, type View } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecentItems, useRecents, type RecentItem } from "../stores/recents";
import { type MenuItem, useUI } from "../stores/ui";
import type { Track } from "../types";

export function recentSearchMenuItems(query: string): MenuItem[] {
  return [
    { label: `Search "${query}"`, icon: MagnifyingGlass, onSelect: () => submitSearch(query) },
    {
      label: "Remove from recent searches",
      icon: X,
      separatorBefore: true,
      onSelect: () => {
        useRecents.getState().removeSearch(query);
        useUI.getState().toast("Removed from recent searches", "info", undefined, {
          label: "Undo",
          run: () => useRecents.getState().pushSearch(query),
        });
      },
    },
  ];
}

export function submitSearch(text: string): void {
  const query = text.trim();
  if (!query) return;
  useNavigation.getState().submitSearch(query);
  useUI.getState().setSearchQuery(query);
  useRecents.getState().pushSearch(query);
  useNavigation.getState().navigate({ name: "search" });
}

function songRecent(track: Track): RecentItem {
  return { kind: "song", id: track.id, title: track.title, subtitle: track.artist, thumb: track.thumb };
}

export function playSong(song: Track, query: string): void {
  useRecents.getState().pushSearch(query);
  useRecentItems.getState().add(songRecent(song));
  usePlayer.getState().playQueue([song], 0);
}

function browseRecent(item: BrowseItem): RecentItem | null {
  if (item.type !== "artist" && item.type !== "album" && item.type !== "playlist") return null;
  return {
    kind: item.type,
    id: item.browseId,
    title: item.title,
    subtitle: item.subtitle,
    thumb: item.thumb,
  };
}

function browseView(item: BrowseItem): View | null {
  switch (item.type) {
    case "artist":
      return { name: "artist", param: item.browseId };
    case "album":
      return { name: "album", param: item.browseId };
    case "playlist":
      return { name: "ytplaylist", param: item.browseId };
    case "other":
      return null;
  }
}

export function openBrowse(item: BrowseItem, query: string): void {
  useRecents.getState().pushSearch(query);
  const recent = browseRecent(item);
  if (recent) useRecentItems.getState().add(recent);
  const view = browseView(item);
  if (!view) {
    useUI.getState().toast(`This result isn't browsable on ${APP_NAME} desktop`, "info");
    return;
  }
  useNavigation.getState().navigate(view);
}

export function openSuggestion(row: SuggestionRow, query: string): void {
  if (row.kind === "completion") {
    submitSearch(row.text);
    return;
  }
  useRecents.getState().pushSearch(query);
  if (row.kind === "track") {
    playSong(row.track, "");
    return;
  }
  openBrowse(row.item, "");
}

export function openRecentItem(item: RecentItem): void {
  useRecentItems.getState().add(item);
  if (item.kind === "song") {
    usePlayer.getState().playQueue([{ id: item.id, title: item.title, artist: item.subtitle, thumb: item.thumb }], 0);
    return;
  }
  const name = item.kind === "playlist" ? "ytplaylist" : item.kind;
  useNavigation.getState().navigate({ name, param: item.id });
}

import { Check, DownloadSimple, LinkSimple, ListDashes, Play, ListPlus, Plus, User } from "@phosphor-icons/react";
import { getAlbumPage, getPlaylistPage } from "./browse";
import { youtubeAlbumLink, youtubePlaylistLink } from "./browseText";
import { downloadAll } from "./downloads";
import { plural } from "./plural";
import type { BrowseItem, SearchSong } from "./searchParse";
import { useNavigation } from "../stores/navigation";
import { useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

export function queueAll(tracks: SearchSong[], message: string): void {
  usePlayer.getState().addToQueue(tracks);
  useUI.getState().toast(message);
}

export function addedMessage(count: number): string {
  return `Added ${plural(count, "song", "songs")} to queue`;
}

export function copyText(text: string, copied: string, failed: string): void {
  navigator.clipboard.writeText(text).then(
    () => useUI.getState().toast(copied, "success"),
    () => useUI.getState().toast(failed, "error"),
  );
}

export function copyLink(url: string): void {
  copyText(url, "Link copied", "Couldn't copy link");
}

function loadTracks(item: BrowseItem): Promise<SearchSong[]> {
  return item.type === "album"
    ? getAlbumPage(item.browseId).then((page) => page.tracks)
    : getPlaylistPage(item.browseId).then((page) => page.tracks);
}

export function browseMenuItems(item: BrowseItem): MenuItem[] {
  if (item.type === "artist") {
    return [
      {
        label: "Open artist",
        icon: User,
        onSelect: () => useNavigation.getState().navigate({ name: "artist", param: item.browseId }),
      },
      {
        label: "Copy link",
        icon: LinkSimple,
        onSelect: () => copyLink(`https://music.youtube.com/channel/${encodeURIComponent(item.browseId)}`),
      },
      { label: item.title, subject: { title: item.title, subtitle: "Artist", thumb: item.thumb, round: true } },
    ];
  }
  if (item.type !== "album" && item.type !== "playlist") return [];

  const isAlbum = item.type === "album";
  const withTracks = (run: (tracks: SearchSong[]) => void) => {
    loadTracks(item).then(run, () => useUI.getState().toast("Couldn't load those songs", "error"));
  };
  return [
    {
      label: "Play",
      icon: Play,
      onSelect: () => withTracks((tracks) => usePlayer.getState().playQueue(tracks, 0, item.browseId)),
    },
    {
      label: "Play next",
      icon: ListDashes,
      onSelect: () => withTracks((tracks) => usePlayer.getState().addToQueue(tracks, true)),
    },
    {
      label: "Add to queue",
      icon: ListPlus,
      onSelect: () => withTracks((tracks) => usePlayer.getState().addToQueue(tracks)),
    },
    {
      label: "Download all",
      icon: DownloadSimple,
      separatorBefore: true,
      onSelect: () => withTracks((tracks) => downloadAll(tracks, item.title)),
    },
    ...(isAlbum ? [savedAlbumItem(item, withTracks)] : []),
    {
      label: "Copy link",
      icon: LinkSimple,
      onSelect: () => copyLink(isAlbum ? youtubeAlbumLink(item.browseId) : youtubePlaylistLink(item.browseId)),
    },
    {
      label: item.title,
      subject: { title: item.title, subtitle: item.subtitle || (isAlbum ? "Album" : "Playlist"), thumb: item.thumb },
    },
  ];
}

function savedAlbumItem(item: BrowseItem, withTracks: (run: (tracks: SearchSong[]) => void) => void): MenuItem {
  if (useLibrary.getState().savedAlbums.some((album) => album.id === item.browseId)) {
    return {
      label: "Remove from Your Library",
      icon: Check,
      onSelect: () => useLibrary.getState().removeSavedAlbum(item.browseId),
    };
  }
  return {
    label: "Save to Your Library",
    icon: Plus,
    onSelect: () =>
      withTracks((tracks) =>
        useLibrary.getState().saveAlbum({
          id: item.browseId,
          title: item.title,
          artist: item.subtitle,
          thumb: item.thumb ?? undefined,
          trackIds: tracks.map((track) => track.id),
        }),
      ),
  };
}

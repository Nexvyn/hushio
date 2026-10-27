import {
  Download01Icon,
  Link01Icon,
  ListStartIcon,
  PlayIcon,
  PlayListAddIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { getAlbumPage, getPlaylistPage } from "./browse";
import { youtubeAlbumLink, youtubePlaylistLink } from "./browseText";
import { plural } from "./plural";
import type { BrowseItem, SearchSong } from "./searchParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

export function queueAll(tracks: SearchSong[], message: string): void {
  usePlayer.getState().addToQueue(tracks);
  useUI.getState().toast(message);
}

export function addedMessage(count: number): string {
  return `Added ${plural(count, "song", "songs")} to queue`;
}

export function copyLink(url: string): void {
  navigator.clipboard.writeText(url).then(
    () => useUI.getState().toast("Link copied", "success"),
    () => useUI.getState().toast("Couldn't copy link", "error"),
  );
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
        icon: UserIcon,
        onSelect: () => useNavigation.getState().navigate({ name: "artist", param: item.browseId }),
      },
      {
        label: "Copy link",
        icon: Link01Icon,
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
      icon: PlayIcon,
      onSelect: () => withTracks((tracks) => usePlayer.getState().playQueue(tracks, 0, item.browseId)),
    },
    {
      label: "Play next",
      icon: ListStartIcon,
      onSelect: () => withTracks((tracks) => usePlayer.getState().addToQueue(tracks, true)),
    },
    {
      label: "Add to queue",
      icon: PlayListAddIcon,
      onSelect: () => withTracks((tracks) => usePlayer.getState().addToQueue(tracks)),
    },
    { label: "Download all", icon: Download01Icon, separatorBefore: true, disabled: true },
    {
      label: "Copy link",
      icon: Link01Icon,
      onSelect: () => copyLink(isAlbum ? youtubeAlbumLink(item.browseId) : youtubePlaylistLink(item.browseId)),
    },
    {
      label: item.title,
      subject: { title: item.title, subtitle: item.subtitle || (isAlbum ? "Album" : "Playlist"), thumb: item.thumb },
    },
  ];
}

import { downloadAll } from "./downloads";
import { addSongsToPlaylists } from "./devicePlaylists";
import { type LikeInput, useLibrary } from "../stores/library";
import { usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";
import { ListDashes, ListPlus, DownloadSimple, Heart, Playlist as PlaylistIcon } from "@phosphor-icons/react";

export function selectionMenuItems(tracks: LikeInput[], extra: MenuItem[] = []): MenuItem[] {
  const ui = useUI.getState;
  const count = `${tracks.length} ${tracks.length === 1 ? "song" : "songs"}`;
  const allLiked = tracks.every((track) => useLibrary.getState().liked.some((item) => item.id === track.id));
  return [
    {
      label: "Play next",
      icon: ListDashes,
      onSelect: () => {
        usePlayer.getState().addToQueue(tracks, true);
        ui().toast(`Playing ${count} next`);
      },
    },
    {
      label: "Add to queue",
      icon: ListPlus,
      onSelect: () => {
        const added = usePlayer.getState().addToQueue(tracks);
        ui().toast(added > 0 ? `Added ${count} to queue` : "Already in your queue");
      },
    },
    {
      label: allLiked ? "Remove from Liked Songs" : "Add to Liked Songs",
      icon: Heart,
      separatorBefore: true,
      onSelect: () => {
        if (allLiked) {
          tracks.forEach((track) => useLibrary.getState().toggleLike(track));
          return;
        }
        useLibrary.getState().likeMany(tracks);
      },
    },
    {
      label: "Add to playlist",
      icon: PlaylistIcon,
      children: useLibrary.getState().playlists.map((playlist) => ({
        label: playlist.name,
        onSelect: () => {
          const added = addSongsToPlaylists([playlist.id], tracks);
          ui().toast(added > 0 ? `Added ${count} to ${playlist.name}` : `Already in ${playlist.name}`);
        },
      })),
    },
    { label: "Download", icon: DownloadSimple, separatorBefore: true, onSelect: () => downloadAll(tracks, count) },
    ...extra,
  ];
}

import {
  Delete02Icon,
  FolderAddIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  PlayListAddIcon,
} from "@hugeicons/core-free-icons";
import type { MenuItem } from "../components/ActionMenu";
import { shortTitle } from "./browseText";
import { addSongsToPlaylists } from "./devicePlaylists";
import type { SearchSong } from "./searchParse";
import { type LibraryTrack, type LikeInput, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export function toSong(track: LibraryTrack): SearchSong {
  return { ...track, artistId: null, albumId: null, isVideo: false };
}

export function playCollection(tracks: LibraryTrack[], source: string, shuffle: boolean) {
  if (tracks.length === 0) return;
  if (shuffle) usePlayer.setState({ shuffle: true });
  const start = shuffle ? Math.floor(Math.random() * tracks.length) : 0;
  usePlayer.getState().playQueue(tracks, start, source);
}

export function createMenuItems(): MenuItem[] {
  return [
    { label: "Create playlist", icon: PlayListAddIcon, onSelect: openCreatePlaylist },
    { label: "Create folder", icon: FolderAddIcon, onSelect: openCreateFolder },
  ];
}

export function openCreatePlaylist() {
  const suggested = `My Playlist #${useLibrary.getState().playlists.length + 1}`;
  useUI.getState().openDialog({
    title: "New playlist",
    body: "Give your playlist a name.",
    initialValue: suggested,
    placeholder: "Playlist name",
    confirmLabel: "Create",
    onConfirm: (value) => {
      const id = useLibrary.getState().createPlaylist(value.trim() || suggested);
      useNavigation.getState().navigate({ name: "playlist", param: id });
    },
  });
}

export function openCreateFolder() {
  const suggested = `My Folder #${useLibrary.getState().folders.length + 1}`;
  useUI.getState().openDialog({
    title: "New folder",
    body: "Give your folder a name.",
    initialValue: suggested,
    placeholder: "Folder name",
    confirmLabel: "Create",
    onConfirm: (value) => {
      useLibrary.getState().createFolder(value.trim() || suggested);
    },
  });
}

export function openRenamePlaylist(id: string) {
  const playlist = useLibrary.getState().playlists.find((item) => item.id === id);
  if (!playlist) return;
  useUI.getState().openDialog({
    title: "Rename playlist",
    initialValue: playlist.name,
    placeholder: "Playlist name",
    confirmLabel: "Save",
    onConfirm: (value) => useLibrary.getState().renamePlaylist(id, value),
  });
}

export function openRenameFolder(id: string) {
  const folder = useLibrary.getState().folders.find((item) => item.id === id);
  if (!folder) return;
  useUI.getState().openDialog({
    title: "Rename folder",
    initialValue: folder.name,
    placeholder: "Folder name",
    confirmLabel: "Save",
    onConfirm: (value) => useLibrary.getState().renameFolder(id, value),
  });
}

export function openDeletePlaylist(id: string) {
  const playlist = useLibrary.getState().playlists.find((item) => item.id === id);
  if (!playlist) return;
  useUI.getState().openDialog({
    title: "Delete playlist?",
    body: `Deleting "${playlist.name}" keeps all of its songs.`,
    confirmLabel: "Delete",
    danger: true,
    onConfirm: () => {
      useLibrary.getState().deletePlaylist(id);
      useNavigation.getState().navigate({ name: "library" });
    },
  });
}

export function openDeleteFolder(id: string) {
  if (!useLibrary.getState().folders.some((item) => item.id === id)) return;
  useUI.getState().openDialog({
    title: "Delete folder?",
    body: "Its playlists move back to Your Library. Nothing is deleted.",
    confirmLabel: "Delete",
    danger: true,
    onConfirm: () => {
      useLibrary.getState().deleteFolder(id);
      useNavigation.getState().navigate({ name: "library" });
    },
  });
}

export function playlistMenuItems(id: string, pinned: boolean): MenuItem[] {
  return [
    {
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PinOffIcon : PinIcon,
      onSelect: () => useLibrary.getState().togglePinPlaylist(id),
    },
    { label: "Rename", icon: PencilEdit02Icon, onSelect: () => openRenamePlaylist(id) },
    { label: "Delete", icon: Delete02Icon, separatorBefore: true, onSelect: () => openDeletePlaylist(id) },
  ];
}

export function folderMenuItems(id: string): MenuItem[] {
  return [
    { label: "Rename folder", icon: PencilEdit02Icon, onSelect: () => openRenameFolder(id) },
    { label: "Delete folder", icon: Delete02Icon, separatorBefore: true, onSelect: () => openDeleteFolder(id) },
  ];
}

export function dropTrackOnTarget(targetId: string, track: LikeInput) {
  const title = shortTitle(track.title);
  const ui = useUI.getState();
  if (targetId === "liked") {
    if (useLibrary.getState().liked.some((item) => item.id === track.id)) {
      ui.toast(`“${title}” is already in your Liked Songs`);
      return;
    }
    useLibrary.getState().toggleLike(track);
    ui.toast(`Added “${title}” to Liked Songs`, "success");
    return;
  }
  const playlist = useLibrary.getState().playlists.find((item) => `playlist:${item.id}` === targetId);
  if (!playlist) return;
  if (addSongsToPlaylists([playlist.id], [track]) > 0) {
    ui.toast(`Added “${title}” to “${playlist.name}”`, "success");
  } else {
    ui.toast(`“${title}” is already in “${playlist.name}”`);
  }
}

export function dropPlaylistOnFolder(playlistId: string, folderId: string) {
  const playlist = useLibrary.getState().playlists.find((item) => item.id === playlistId);
  if (!playlist) return;
  useLibrary.getState().setPlaylistFolder(playlistId, folderId);
  useUI.getState().toast(`Moved “${playlist.name}” into the folder`);
}

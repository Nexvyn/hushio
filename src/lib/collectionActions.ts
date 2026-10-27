import {
  ClipboardIcon,
  Delete02Icon,
  FileUploadIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  PencilEdit02Icon,
  PinIcon,
  PinOffIcon,
  PlayListAddIcon,
} from "@hugeicons/core-free-icons";
import { APP_NAME } from "./app";
import { shortTitle } from "./browseText";
import { addSongsToPlaylists } from "./devicePlaylists";
import { plural } from "./plural";
import type { SearchSong } from "./searchParse";
import { coversOf } from "./collections";
import { type LibraryTrack, type LikeInput, type Playlist, type PinnedSingles, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { type MenuItem, useUI } from "../stores/ui";

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
    {
      label: "Playlist",
      note: "Create a playlist with songs",
      icon: PlayListAddIcon,
      onSelect: openCreatePlaylist,
    },
    { label: "Folder", note: "Organize your playlists", icon: Folder01Icon, onSelect: openCreateFolder },
    {
      label: "Import a playlist link or song list",
      note: "Paste a playlist link or song names",
      icon: ClipboardIcon,
      disabled: true,
    },
    { label: "Import a file", note: `.csv, .txt, .m3u8 or ${APP_NAME} .json`, icon: FileUploadIcon, disabled: true },
  ];
}

export function panelMenuItems(): MenuItem[] {
  return [
    { label: "Your Library", header: true },
    { label: "Create playlist", icon: PlayListAddIcon, onSelect: openCreatePlaylist },
    { label: "Create folder", icon: FolderAddIcon, onSelect: openCreateFolder },
  ];
}

export function openNewPlaylistWith(track: SearchSong) {
  const suggested = `Playlist ${useLibrary.getState().playlists.length + 1}`;
  useUI.getState().openDialog({
    title: "New playlist",
    body: `Add "${shortTitle(track.title)}" to a new playlist.`,
    initialValue: suggested,
    placeholder: "Playlist name",
    confirmLabel: "Create",
    onConfirm: (value) => {
      const library = useLibrary.getState();
      const id = library.createPlaylist(value.trim() || suggested);
      library.addToPlaylist(id, track);
      useNavigation.getState().navigate({ name: "playlist", param: id });
    },
  });
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
    title: `Delete "${playlist.name}"?`,
    body: "This can't be undone. The tracks themselves aren't affected.",
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

export function playlistHeaderItems(playlist: Playlist): MenuItem[] {
  const count = playlist.tracks.length;
  return [
    { label: "Rename", icon: PencilEdit02Icon, onSelect: () => openRenamePlaylist(playlist.id) },
    { label: "Delete playlist", icon: Delete02Icon, danger: true, onSelect: () => openDeletePlaylist(playlist.id) },
    {
      label: playlist.name,
      subject: {
        title: playlist.name,
        subtitle: `Playlist · ${plural(count, "song", "songs")}`,
        thumb: coversOf(playlist.tracks, 1)[0] ?? null,
      },
    },
  ];
}

export function playlistOwnItems(playlist: Playlist): MenuItem[] {
  const folders = useLibrary.getState().folders;
  const folder = folders.find((item) => item.id === playlist.folderId);
  const subject: MenuItem = {
    label: playlist.name,
    subject: {
      title: playlist.name,
      subtitle: `Playlist · ${plural(playlist.tracks.length, "song", "songs")}`,
      thumb: coversOf(playlist.tracks, 1)[0] ?? null,
    },
  };
  const folderItems: MenuItem[] =
    folders.length === 0
      ? []
      : [
          { label: "Folder", header: true, separatorBefore: true },
          ...folders.map((item) => ({
            label: item.name,
            icon: FolderOpenIcon,
            checked: item.id === playlist.folderId,
            onSelect: () => useLibrary.getState().setPlaylistFolder(playlist.id, item.id),
          })),
        ];

  if (folder) {
    return [
      { label: "Rename", icon: PencilEdit02Icon, onSelect: () => openRenamePlaylist(playlist.id) },
      {
        label: "Remove from folder",
        icon: FolderOpenIcon,
        danger: true,
        onSelect: () => {
          const previous = playlist.folderId;
          useLibrary.getState().setPlaylistFolder(playlist.id, null);
          useUI.getState().toast("Removed from folder", "info", undefined, {
            label: "Undo",
            run: () => useLibrary.getState().setPlaylistFolder(playlist.id, previous),
          });
        },
      },
      subject,
      ...folderItems,
      { label: "Delete playlist", icon: Delete02Icon, separatorBefore: true, onSelect: () => openDeletePlaylist(playlist.id) },
    ];
  }

  return [
    { label: "Rename", icon: PencilEdit02Icon, onSelect: () => openRenamePlaylist(playlist.id) },
    { label: "Delete playlist", icon: Delete02Icon, danger: true, onSelect: () => openDeletePlaylist(playlist.id) },
    subject,
    ...folderItems,
  ];
}

export function playlistMenuItems(playlist: Playlist): MenuItem[] {
  return [
    {
      label: playlist.pinned ? "Unpin playlist" : "Pin playlist",
      icon: playlist.pinned ? PinOffIcon : PinIcon,
      onSelect: () => useLibrary.getState().togglePinPlaylist(playlist.id),
    },
    ...playlistOwnItems(playlist),
  ];
}

export function folderMenuItems(id: string): MenuItem[] {
  return [
    { label: "Rename folder", icon: PencilEdit02Icon, onSelect: () => openRenameFolder(id) },
    { label: "Delete folder", icon: Delete02Icon, danger: true, separatorBefore: true, onSelect: () => openDeleteFolder(id) },
  ];
}

export function pinnedSingleMenuItems(key: keyof PinnedSingles, pinned: boolean): MenuItem[] {
  return [
    {
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PinOffIcon : PinIcon,
      onSelect: () => useLibrary.getState().togglePinSingle(key),
    },
  ];
}

export function artistRowMenuItems(artist: { id: string; name: string }): MenuItem[] {
  return [
    {
      label: "Remove from your library",
      icon: Delete02Icon,
      danger: true,
      onSelect: () =>
        useUI.getState().openDialog({
          title: `Remove “${artist.name}”?`,
          confirmLabel: "Remove",
          danger: true,
          onConfirm: () => {
            useLibrary.getState().unfollowArtist(artist.id);
            useUI.getState().toast(`Removed “${artist.name}” from your library`);
          },
        }),
    },
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

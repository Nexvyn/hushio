import { Clipboard, Copy, StackMinus, Trash, Export, UploadSimple, Folder, FolderPlus, FolderOpen, PencilSimple, PushPin, PushPinSlash, ListPlus, SortDescending } from "@phosphor-icons/react";
import { APP_NAME } from "./app";
import { shortTitle } from "./browseText";
import { downloadText, safeFileName } from "./downloadText";
import { addSongsToPlaylists } from "./devicePlaylists";
import { plural } from "./plural";
import { playlistToJson, playlistToM3u8, playlistToSongList, shareable } from "./playlistFiles";
import { copyText } from "./browseActions";
import type { SearchSong } from "./searchParse";
import { playlistCovers } from "./playlistCover";
import { usePlaylistEdit } from "../stores/playlistEdit";
import { userTracks } from "./smartShuffle";
import type { Track } from "../types";
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
      icon: ListPlus,
      onSelect: openCreatePlaylist,
    },
    { label: "Folder", note: "Organize your playlists", icon: Folder, onSelect: openCreateFolder },
    {
      label: "Import a playlist link or song list",
      note: "Paste a playlist link or song names",
      icon: Clipboard,
      disabled: true,
    },
    { label: "Import a file", note: `.csv, .txt, .m3u8 or ${APP_NAME} .json`, icon: UploadSimple, disabled: true },
  ];
}

export function panelMenuItems(): MenuItem[] {
  return [
    { label: "Your Library", header: true },
    { label: "Create playlist", icon: ListPlus, onSelect: openCreatePlaylist },
    { label: "Create folder", icon: FolderPlus, onSelect: openCreateFolder },
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
    body: playlist.remote?.imported
      ? "Removes it from Hushio only. The playlist and its songs stay on YouTube."
      : "This can't be undone. The tracks themselves aren't affected.",
    confirmLabel: "Delete",
    danger: true,
    onConfirm: () => {
      const { view, navigate } = useNavigation.getState();
      useLibrary.getState().deletePlaylist(id);
      if (view.name === "playlist" && view.param === id) navigate({ name: "library" });
    },
  });
}

function openDeleteFolder(id: string) {
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

export function exportPlaylist(playlist: Playlist, format: "m3u8" | "json"): void {
  const ui = useUI.getState();
  if (shareable(playlist.tracks).length === 0) {
    ui.toast("Nothing to export in this playlist");
    return;
  }
  const base = safeFileName(playlist.name);
  if (format === "m3u8") {
    downloadText(`${base}.m3u8`, playlistToM3u8(playlist.name, playlist.tracks), "audio/x-mpegurl");
  } else {
    downloadText(`${base}.json`, playlistToJson(playlist.name, playlist.tracks), "application/json");
  }
  ui.toast("Playlist exported", "success");
}

function copySongList(playlist: Playlist): void {
  if (playlist.tracks.length === 0) {
    useUI.getState().toast("Nothing to copy in this playlist");
    return;
  }
  copyText(playlistToSongList(playlist.name, playlist.tracks), "Song list copied", "Couldn't copy song list");
}

export type SortKey = "title" | "artist" | "album" | "duration";

const SORT_LABELS: Record<SortKey, string> = { title: "Title", artist: "Artist", album: "Album", duration: "Duration" };

function sortValue(track: LibraryTrack, key: SortKey): string | number | null {
  if (key === "duration") return track.duration > 0 ? track.duration : null;
  const value = (key === "album" ? track.album : track[key])?.trim();
  return value ? value : null;
}

export function sortTracks(tracks: LibraryTrack[], key: SortKey): LibraryTrack[] {
  return [...tracks].sort((a, b) => {
    const left = sortValue(a, key);
    const right = sortValue(b, key);
    if (left === null || right === null) {
      if (left === right) return 0;
      return left === null ? 1 : -1;
    }
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left).localeCompare(String(right), undefined, { sensitivity: "base" });
  });
}

function withoutDuplicates(tracks: LibraryTrack[]): LibraryTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function currentTracks(playlistId: string): LibraryTrack[] | null {
  return useLibrary.getState().playlists.find((item) => item.id === playlistId)?.tracks ?? null;
}

function undoTracks(playlistId: string, tracks: LibraryTrack[]) {
  return { label: "Undo", run: () => useLibrary.getState().setPlaylistTracks(playlistId, tracks) };
}

export function sortPlaylistBy(playlistId: string, key: SortKey) {
  const previous = currentTracks(playlistId);
  if (!previous) return;
  useLibrary.getState().setPlaylistTracks(playlistId, sortTracks(previous, key));
  useUI
    .getState()
    .toast(`Sorted by ${SORT_LABELS[key].toLowerCase()}`, "info", undefined, undoTracks(playlistId, previous));
}

export function removePlaylistDuplicates(playlistId: string) {
  const previous = currentTracks(playlistId);
  if (!previous) return;
  const kept = withoutDuplicates(previous);
  const removed = previous.length - kept.length;
  const ui = useUI.getState();
  if (removed === 0) {
    ui.toast("No duplicates");
    return;
  }
  useLibrary.getState().setPlaylistTracks(playlistId, kept);
  ui.toast(
    `Removed ${plural(removed, "duplicate", "duplicates")}`,
    "info",
    undefined,
    undoTracks(playlistId, previous),
  );
}

export function queueName(now: Date = new Date()): string {
  return `Queue ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function saveQueueAsPlaylist(tracks: Track[]): string | null {
  const own = userTracks(tracks);
  if (own.length === 0) return null;
  const name = queueName();
  const id = useLibrary.getState().createPlaylist(name);
  for (const track of own) useLibrary.getState().addToPlaylist(id, track);
  useUI.getState().toast(`Saved as ${name}`, "success", undefined, {
    label: "Open",
    run: () => useNavigation.getState().navigate({ name: "playlist", param: id }),
  });
  return id;
}

export function playlistHeaderItems(playlist: Playlist): MenuItem[] {
  const count = playlist.tracks.length;
  return [
    playlist.remote ? { label: "Rename", icon: PencilSimple, onSelect: () => openRenamePlaylist(playlist.id) } : { label: "Edit details", icon: PencilSimple, onSelect: () => usePlaylistEdit.getState().open(playlist.id) },
    { label: "Export as M3U8", icon: Export, onSelect: () => exportPlaylist(playlist, "m3u8") },
    { label: "Export as JSON", icon: Export, onSelect: () => exportPlaylist(playlist, "json") },
    { label: "Copy song list", icon: Copy, onSelect: () => copySongList(playlist) },
    {
      label: "Sort by",
      icon: SortDescending,
      children: (Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
        label: SORT_LABELS[key],
        onSelect: () => sortPlaylistBy(playlist.id, key),
      })),
    },
    { label: "Remove duplicates", icon: StackMinus, onSelect: () => removePlaylistDuplicates(playlist.id) },
    { label: "Delete playlist", icon: Trash, danger: true, onSelect: () => openDeletePlaylist(playlist.id) },
    {
      label: playlist.name,
      subject: {
        title: playlist.name,
        subtitle: `Playlist · ${plural(count, "song", "songs")}`,
        thumb: playlistCovers(playlist, 1)[0] ?? null,
      },
    },
  ];
}

function playlistOwnItems(playlist: Playlist): MenuItem[] {
  const folders = useLibrary.getState().folders;
  const folder = folders.find((item) => item.id === playlist.folderId);
  const subject: MenuItem = {
    label: playlist.name,
    subject: {
      title: playlist.name,
      subtitle: `Playlist · ${plural(playlist.tracks.length, "song", "songs")}`,
      thumb: playlistCovers(playlist, 1)[0] ?? null,
    },
  };
  const folderItems: MenuItem[] =
    folders.length === 0
      ? []
      : [
          { label: "Folder", header: true, separatorBefore: true },
          ...folders.map((item) => ({
            label: item.name,
            icon: FolderOpen,
            checked: item.id === playlist.folderId,
            onSelect: () => useLibrary.getState().setPlaylistFolder(playlist.id, item.id),
          })),
        ];

  if (folder) {
    return [
      { label: "Rename", icon: PencilSimple, onSelect: () => openRenamePlaylist(playlist.id) },
      {
        label: "Remove from folder",
        icon: FolderOpen,
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
      { label: "Delete playlist", icon: Trash, separatorBefore: true, onSelect: () => openDeletePlaylist(playlist.id) },
    ];
  }

  return [
    { label: "Rename", icon: PencilSimple, onSelect: () => openRenamePlaylist(playlist.id) },
    { label: "Delete playlist", icon: Trash, danger: true, onSelect: () => openDeletePlaylist(playlist.id) },
    subject,
    ...folderItems,
  ];
}

export function playlistMenuItems(playlist: Playlist): MenuItem[] {
  return [
    {
      label: playlist.pinned ? "Unpin playlist" : "Pin playlist",
      icon: playlist.pinned ? PushPinSlash : PushPin,
      onSelect: () => useLibrary.getState().togglePinPlaylist(playlist.id),
    },
    ...playlistOwnItems(playlist),
  ];
}

export function folderMenuItems(id: string): MenuItem[] {
  return [
    { label: "Rename folder", icon: PencilSimple, onSelect: () => openRenameFolder(id) },
    { label: "Delete folder", icon: Trash, danger: true, separatorBefore: true, onSelect: () => openDeleteFolder(id) },
  ];
}

export function pinnedSingleMenuItems(key: keyof PinnedSingles, pinned: boolean): MenuItem[] {
  return [
    {
      label: pinned ? "Unpin" : "Pin to top",
      icon: pinned ? PushPinSlash : PushPin,
      onSelect: () => useLibrary.getState().togglePinSingle(key),
    },
  ];
}

export function artistRowMenuItems(artist: { id: string; name: string }): MenuItem[] {
  return [
    {
      label: "Remove from your library",
      icon: Trash,
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
    ui.toast(`Added “${title}” to Liked Songs`, "success", undefined, undefined, { art: track.thumb ?? undefined });
    return;
  }
  const playlist = useLibrary.getState().playlists.find((item) => `playlist:${item.id}` === targetId);
  if (!playlist) return;
  if (addSongsToPlaylists([playlist.id], [track]) > 0) {
    ui.toast(`Added “${title}” to “${playlist.name}”`, "success", undefined, undefined, { art: track.thumb ?? undefined });
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

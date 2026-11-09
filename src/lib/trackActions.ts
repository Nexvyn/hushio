import {
  Album01Icon,
  ArrowDown01Icon,
  ArrowDownDoubleIcon,
  ArrowUp01Icon,
  ArrowUpDoubleIcon,
  Copy01Icon,
  Delete02Icon,
  Download01Icon,
  FavouriteIcon,
  FolderOpenIcon,
  Link01Icon,
  ListStartIcon,
  MoonIcon,
  PlayIcon,
  PlayListAddIcon,
  Playlist01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import type { Box } from "./pickerLayout";
import { copyLink } from "./browseActions";
import { openNewPlaylistWith, toSong } from "./collectionActions";
import { addSongsToPlaylists } from "./devicePlaylists";
import { downloadedPath, revealDownload, startDownload } from "./downloads";
import { sleepMenuItems } from "./sleepActions";
import type { SearchSong } from "./searchParse";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { type MenuItem, type ToastAction, useUI } from "../stores/ui";
import type { Track } from "../types";

const PLAYLIST_CAP = 6;

function notify(message: string, action?: ToastAction) {
  useUI.getState().toast(message, "info", undefined, action);
}

export function songOf(track: Track): SearchSong {
  return { ...track, album: null, duration: 0, explicit: false, artistId: null, albumId: null, isVideo: false };
}

export function isLocalTrack(track: Pick<Track, "id">): boolean {
  return track.id.startsWith("local:");
}

function addToNamedPlaylist(playlist: Playlist, track: SearchSong) {
  const added = addSongsToPlaylists([playlist.id], [track]) > 0;
  notify(added ? `Added to "${playlist.name}"` : "Already in this playlist");
}

function copyLog(track: SearchSong) {
  const record = JSON.stringify(
    {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artistId: track.artistId,
      albumId: track.albumId,
      duration: track.duration,
      explicit: track.explicit,
      isVideo: track.isVideo,
    },
    null,
    2,
  );
  navigator.clipboard.writeText(record).then(
    () => notify("Log copied"),
    () => useUI.getState().toast("Couldn't copy log", "error"),
  );
}

export function trackMenuItems(track: SearchSong): MenuItem[] {
  const library = useLibrary.getState();
  const liked = library.liked.some((item) => item.id === track.id);
  const playlists = library.playlists;
  const local = isLocalTrack(track);
  const { artistId, albumId } = track;

  const items: MenuItem[] = [
    { label: "Play now", icon: PlayIcon, onSelect: () => usePlayer.getState().playTrack(track) },
    {
      label: "Play next",
      icon: ListStartIcon,
      onSelect: () => {
        usePlayer.getState().addToQueue([track], true);
        notify("Playing next");
      },
    },
    {
      label: "Add to queue",
      icon: PlayListAddIcon,
      onSelect: () => notify(usePlayer.getState().addToQueue([track]) > 0 ? "Added to queue" : "Already in your queue"),
    },
    {
      label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
      icon: FavouriteIcon,
      separatorBefore: true,
      onSelect: () => useLibrary.getState().toggleLike(track),
    },
    ...playlists.slice(0, PLAYLIST_CAP).map((playlist) => ({
      label: `Add to "${playlist.name}"`,
      onSelect: () => addToNamedPlaylist(playlist, track),
    })),
  ];
  if (playlists.length > 1) {
    items.push({ label: "Add to playlists", icon: PlayListAddIcon, onSelect: (anchor?: Box) => useUI.getState().openPlaylistPicker([track], anchor) });
  }
  items.push({ label: "New playlist", icon: Playlist01Icon, onSelect: () => openNewPlaylistWith(track) });

  if (!local) {
    const saved = downloadedPath(track.id);
    items.push(
      saved
        ? { label: "Show in folder", icon: FolderOpenIcon, separatorBefore: true, onSelect: () => revealDownload(saved) }
        : { label: "Download", icon: Download01Icon, separatorBefore: true, onSelect: () => void startDownload(track) },
    );
  }
  if (artistId) {
    items.push({
      label: "Go to artist",
      icon: UserIcon,
      separatorBefore: true,
      onSelect: () => useNavigation.getState().navigate({ name: "artist", param: artistId }),
    });
  }
  if (albumId) {
    items.push({
      label: "Go to album",
      icon: Album01Icon,
      separatorBefore: !artistId,
      onSelect: () => useNavigation.getState().navigate({ name: "album", param: albumId }),
    });
  }
  if (!local) {
    items.push({
      label: "Copy link",
      icon: Link01Icon,
      onSelect: () => copyLink(`https://music.youtube.com/watch?v=${track.id}`),
    });
  }
  items.push(
    { label: "Sleep timer", icon: MoonIcon, separatorBefore: true, children: sleepMenuItems() },
    { label: "Copy log", icon: Copy01Icon, onSelect: () => copyLog(track) },
    { label: track.title, subject: { title: track.title, subtitle: track.artist, thumb: track.thumb } },
  );
  return items;
}

export function historyMenuItems(track: LibraryTrack): MenuItem[] {
  return [
    {
      label: "Remove from Recently played",
      icon: Delete02Icon,
      danger: true,
      onSelect: () => {
        useLibrary.getState().removeFromHistory(track.id);
        notify("Removed from Recently played", {
          label: "Undo",
          run: () => useLibrary.getState().pushHistory(track),
        });
      },
    },
    ...trackMenuItems(toSong(track)),
  ];
}

export function playlistTrackMenuItems(playlist: Playlist, index: number): MenuItem[] {
  const tracks = playlist.tracks;
  const track = tracks[index];
  const last = tracks.length - 1;
  const moveTo = (to: number) => () => useLibrary.getState().moveInPlaylist(playlist.id, index, to);
  const moves: MenuItem[] =
    tracks.length < 2
      ? []
      : [
          { label: "Move up", icon: ArrowUp01Icon, disabled: index === 0, onSelect: moveTo(index - 1) },
          { label: "Move down", icon: ArrowDown01Icon, disabled: index === last, onSelect: moveTo(index + 1) },
          { label: "Move to top", icon: ArrowUpDoubleIcon, disabled: index === 0, onSelect: moveTo(0) },
          { label: "Move to bottom", icon: ArrowDownDoubleIcon, disabled: index === last, onSelect: moveTo(last) },
        ];
  const remove: MenuItem = {
    label: "Remove from this playlist",
    icon: Delete02Icon,
    separatorBefore: moves.length > 0,
    onSelect: () => {
      useLibrary.getState().removeFromPlaylist(playlist.id, track.id);
      notify("Removed from playlist", {
        label: "Undo",
        run: () => useLibrary.getState().restoreTrackInPlaylist(playlist.id, track, index),
      });
    },
  };
  return [
    ...moves,
    remove,
    ...trackMenuItems(toSong(track)).map((item, position) => (position === 0 ? { ...item, separatorBefore: true } : item)),
  ];
}

export function playerAddMenuItems(track: SearchSong): MenuItem[] {
  const library = useLibrary.getState();
  const playlists = library.playlists;
  const liked = library.liked.some((item) => item.id === track.id);
  const picks: MenuItem[] = playlists.slice(0, PLAYLIST_CAP).map((playlist) => {
    const checked = playlist.tracks.some((item) => item.id === track.id);
    return {
      label: playlist.name,
      toggle: true,
      checked,
      onSelect: () => {
        if (checked) {
          useLibrary.getState().removeFromPlaylist(playlist.id, track.id);
          notify(`Removed from "${playlist.name}"`, {
            label: "Undo",
            run: () => useLibrary.getState().addToPlaylist(playlist.id, track),
          });
          return;
        }
        addToNamedPlaylist(playlist, track);
      },
    };
  });
  const children: MenuItem[] = [
    ...picks,
    ...(playlists.length > PLAYLIST_CAP
      ? [{ label: "Add to playlists", icon: PlayListAddIcon, onSelect: (anchor?: Box) => useUI.getState().openPlaylistPicker([track], anchor) }]
      : []),
    {
      label: "New playlist",
      icon: PlayListAddIcon,
      separatorBefore: playlists.length > 0,
      onSelect: () => openNewPlaylistWith(track),
    },
  ];
  return [
    { label: liked ? "Remove from Liked Songs" : "Add to Liked Songs", icon: FavouriteIcon, onSelect: () => useLibrary.getState().toggleLike(track) },
    { label: "Add to playlist", icon: Playlist01Icon, children },
    { label: track.title, subject: { title: track.title, subtitle: track.artist, thumb: track.thumb } },
  ];
}

import { VinylRecord, CaretDown, CaretDoubleDown, CaretUp, CaretDoubleUp, Copy, Trash, DownloadSimple, Heart, Info, ListDashes, MusicNotesPlus, Moon, PencilSimple, Play, ListPlus, Playlist as PlaylistIcon, Radio, ShareNetwork, User } from "@phosphor-icons/react";
import type { Box } from "./pickerLayout";
import { canEditTags } from "./localLibrary";
import { useTrackEdit } from "../stores/trackEdit";
import { copyLink } from "./browseActions";
import { isAddonTrackId } from "./searchScope";
import { trackShareLink } from "./shareLink";
import { openNewPlaylistWith, toSong } from "./collectionActions";
import { addSongsToPlaylists } from "./devicePlaylists";
import { downloadedPath, startDownload } from "./downloads";
import { flyToQueue } from "./flyToTarget";
import { reducedMotion } from "./motion";
import { sleepMenuItems } from "./sleepActions";
import { traceOn } from "./streamTrace";
import type { SearchSong } from "./searchParse";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { currentTrack, usePlayer } from "../stores/player";
import { useSongInfo } from "../stores/songInfo";
import { type MenuItem, type ToastAction, useUI } from "../stores/ui";
import { trackToastOptions } from "./toastStack";
import type { Track } from "../types";

const PLAYLIST_CAP = 6;
const albumLookups = new Set<string>();
let latestAlbumLookup = 0;

export async function playAlbumVersion(track: Track): Promise<void> {
  if (albumLookups.has(track.id)) return;
  albumLookups.add(track.id);
  const request = ++latestAlbumLookup;
  const initialTrackId = currentTrack(usePlayer.getState())?.id;
  const { toast, dismissToast } = useUI.getState();
  const pending = toast("Finding the album recording.");
  try {
    const { matchSong } = await import("./importMatch");
    const match = await matchSong({ title: track.title, artist: track.artist, album: track.album ?? undefined, duration: 0 }, "");
    if (request !== latestAlbumLookup || currentTrack(usePlayer.getState())?.id !== initialTrackId) return;
    if (!match) { toast("No matching album recording found. Try Songs in Search.", "info"); return; }
    usePlayer.getState().playTrack(match);
    toast("Playing the song recording", "success");
  } catch {
    if (request !== latestAlbumLookup) return;
    toast("Couldn't find the album recording. Try again.", "error");
  } finally {
    dismissToast(pending);
    albumLookups.delete(track.id);
  }
}

function notify(message: string, action?: ToastAction) {
  useUI.getState().toast(message, "info", undefined, action);
}

function notifyTrack(message: string, track: Pick<Track, "title" | "artist" | "thumb">) {
  useUI.getState().toast(message, "info", undefined, undefined, trackToastOptions(track));
}

function flyTrackToQueue(anchor: Box | undefined, track: Track) {
  if (anchor && track.thumb) flyToQueue(anchor, track.thumb, reducedMotion());
}

export function songOf(track: Track): SearchSong {
  return { ...track, album: null, duration: 0, explicit: false, artistId: null, albumId: null, isVideo: false };
}

function isLocalTrack(track: Pick<Track, "id">): boolean {
  return track.id.startsWith("local:");
}

function shareTrack(track: SearchSong) {
  const url = trackShareLink(track.id);
  if (typeof navigator.share !== "function") {
    copyLink(url);
    return;
  }
  navigator.share({ title: track.title, text: `${track.title} by ${track.artist}`, url }).catch((error: Error) => {
    if (error.name !== "AbortError") copyLink(url);
  });
}

function addToNamedPlaylist(playlist: Playlist, track: SearchSong) {
  const added = addSongsToPlaylists([playlist.id], [track]) > 0;
  notifyTrack(added ? `Added to "${playlist.name}"` : "Already in this playlist", track);
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
  const playingNow = currentTrack(usePlayer.getState())?.id === track.id;
  const external = local || isAddonTrackId(track.id);

  const items: MenuItem[] = [
    ...(playingNow ? [] : [{ label: "Play now", icon: Play, onSelect: () => usePlayer.getState().playTrack(track) }]),
    {
      label: "Play next",
      icon: ListDashes,
      onSelect: (anchor) => {
        usePlayer.getState().addToQueue([track], true);
        notifyTrack("Playing next", track);
        flyTrackToQueue(anchor, track);
      },
    },
    {
      label: "Add to queue",
      icon: ListPlus,
      onSelect: (anchor) => {
        const added = usePlayer.getState().addToQueue([track]) > 0;
        notifyTrack(added ? "Added to queue" : "Already in your queue", track);
        if (added) flyTrackToQueue(anchor, track);
      },
    },
    ...(external ? [] : [{ label: "Start radio", icon: Radio, onSelect: () => void usePlayer.getState().startRadio(track) }]),
    {
      label: liked ? "Remove from Liked Songs" : "Add to Liked Songs",
      icon: Heart,
      separatorBefore: true,
      onSelect: () => useLibrary.getState().toggleLike(track),
    },
    ...playlists.slice(0, PLAYLIST_CAP).map((playlist) => ({
      label: `Add to "${playlist.name}"`,
      icon: MusicNotesPlus,
      onSelect: () => addToNamedPlaylist(playlist, track),
    })),
  ];
  if (playlists.length > 1) {
    items.push({ label: "Add to playlists", icon: ListPlus, onSelect: (anchor?: Box) => useUI.getState().openPlaylistPicker([track], anchor) });
  }
  items.push({ label: "New playlist", icon: PlaylistIcon, onSelect: () => openNewPlaylistWith(track) });

  if (!external && !("episode" in track && track.episode)) {
    items.push({ label: "Play album version", icon: VinylRecord, onSelect: () => void playAlbumVersion(track) });
  }
  if (!external && !downloadedPath(track.id)) {
    items.push({ label: "Download", icon: DownloadSimple, separatorBefore: true, onSelect: () => void startDownload(track) });
  }
  if (artistId) {
    items.push({
      label: "Go to artist",
      icon: User,
      separatorBefore: true,
      onSelect: () => useNavigation.getState().navigate({ name: "artist", param: artistId }),
    });
  }
  if (albumId) {
    items.push({
      label: "Go to album",
      icon: VinylRecord,
      separatorBefore: !artistId,
      onSelect: () => useNavigation.getState().navigate({ name: "album", param: albumId }),
    });
  }
  if (!external) {
    items.push({ label: "Share", icon: ShareNetwork, onSelect: () => shareTrack(track) });
  }
  items.push(
    ...(local && canEditTags() ? [{ label: "Edit info", icon: PencilSimple, onSelect: () => useTrackEdit.getState().open(track.id) }] : []),
    { label: "Song info", icon: Info, onSelect: () => useSongInfo.getState().open(track) },
    { label: "Sleep timer", icon: Moon, separatorBefore: true, children: sleepMenuItems() },
    ...(traceOn() ? [{ label: "Copy log", icon: Copy, onSelect: () => copyLog(track) }] : []),
    { label: track.title, subject: { title: track.title, subtitle: track.artist, thumb: track.thumb } },
  );
  return items;
}

export function historyMenuItems(track: LibraryTrack): MenuItem[] {
  return [
    {
      label: "Remove from Recently played",
      icon: Trash,
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
          { label: "Move up", icon: CaretUp, disabled: index === 0, onSelect: moveTo(index - 1) },
          { label: "Move down", icon: CaretDown, disabled: index === last, onSelect: moveTo(index + 1) },
          { label: "Move to top", icon: CaretDoubleUp, disabled: index === 0, onSelect: moveTo(0) },
          { label: "Move to bottom", icon: CaretDoubleDown, disabled: index === last, onSelect: moveTo(last) },
        ];
  const remove: MenuItem = {
    label: "Remove from this playlist",
    icon: Trash,
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
      ? [{ label: "Add to playlists", icon: ListPlus, onSelect: (anchor?: Box) => useUI.getState().openPlaylistPicker([track], anchor) }]
      : []),
    {
      label: "New playlist",
      icon: ListPlus,
      separatorBefore: playlists.length > 0,
      onSelect: () => openNewPlaylistWith(track),
    },
  ];
  return [
    { label: liked ? "Remove from Liked Songs" : "Add to Liked Songs", icon: Heart, onSelect: () => useLibrary.getState().toggleLike(track) },
    { label: "Add to playlist", icon: PlaylistIcon, children },
    { label: track.title, subject: { title: track.title, subtitle: track.artist, thumb: track.thumb } },
  ];
}

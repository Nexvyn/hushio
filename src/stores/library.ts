import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  deletionKey,
  type DeletionChange,
  type DeletionSync,
  emptyDeletionSync,
  readDeletionSync,
  recordDeletionChanges,
  rekeyPlaylistTracks,
} from "../lib/deletionSync";
import { moveKey } from "../lib/libraryOrder";
import { isTestSong } from "../lib/devSong";
import { playlistCoverRemove, scrobbleLove, type YtSyncJob } from "../lib/bridge";
import {
  mergeYtRemote,
  queueYtJobs,
  queueYtMove,
  rateYtSong,
  unlinkYtPlaylist,
  videoIdOf,
  ytMoveJob,
  type YtPending,
} from "../lib/ytSync";
import { persistStorage } from "../lib/persist";
import { useSettings } from "./settings";
import type { Track } from "../types";

export const HISTORY_LIMIT = 200;
export const LIBRARY_VERSION = 7;
export const PLAYLIST_DESCRIPTION_MAX = 300;

export type LibraryTrack = Track & { album: string | null; duration: number; explicit: boolean; addedAt?: number };
export type LikeInput = Track & Partial<Pick<LibraryTrack, "album" | "duration" | "explicit">>;

export type DownloadTrack = {
  id: string;
  title: string;
  artist: string;
  thumb?: string;
  album?: string;
  duration: number;
};
type DownloadStatus = "waiting" | "queued" | "downloading" | "done" | "failed";
export type DownloadItem = {
  track: DownloadTrack;
  path: string | null;
  status: DownloadStatus;
  progress: number;
  downloaded: number;
  total: number;
};

export type FollowedArtist = { id: string; name: string; thumb?: string; followedAt: number };
type ArtistInput = Omit<FollowedArtist, "followedAt">;

export type PinnedSingles = {
  liked: boolean;
  spotify: boolean;
  downloads: boolean;
  local: boolean;
  v2: boolean;
};

export const DEFAULT_PINS: PinnedSingles = {
  liked: true,
  spotify: true,
  downloads: false,
  local: false,
  v2: true,
};

export type Playlist = {
  id: string;
  name: string;
  folderId: string | null;
  pinned: boolean;
  tracks: LibraryTrack[];
  remote?: { ytPlaylistId: string; imported?: true; refreshedAt?: number };
  pendingYt?: YtPending;
  description?: string;
  coverPath?: string;
};

export type SavedAlbum = {
  id: string;
  title: string;
  artist: string;
  thumb?: string;
  year?: string;
  savedAt: number;
  trackIds?: string[];
};
export type SavedAlbumInput = Omit<SavedAlbum, "savedAt">;

export type PlaylistEdit = {
  name?: string;
  description?: string;
  coverPath?: string | null;
};

export type Folder = { id: string; name: string };

export type LibraryValues = {
  liked: LibraryTrack[];
  history: LibraryTrack[];
  followedArtists: FollowedArtist[];
  pinnedSingles: PinnedSingles;
  playlists: Playlist[];
  folders: Folder[];
  savedAlbums: SavedAlbum[];
  downloads: Record<string, DownloadItem>;
  libraryOrder: string[] | undefined;
  deletionSync: DeletionSync | undefined;
};

type LibraryState = LibraryValues & {
  saveAlbum: (album: SavedAlbumInput) => void;
  removeSavedAlbum: (id: string) => void;
  setDownload: (id: string, item: DownloadItem) => void;
  patchDownload: (id: string, patch: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  toggleLike: (track: LikeInput) => void;
  likeMany: (tracks: LikeInput[]) => number;
  setLikedTracks: (tracks: LibraryTrack[]) => void;
  importLikedTracks: (tracks: LikeInput[]) => void;
  pushHistory: (track: LikeInput) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  followArtist: (artist: ArtistInput) => boolean;
  unfollowArtist: (id: string) => void;
  createPlaylist: (name: string) => string;
  createPlaylistWith: (name: string, tracks: LikeInput[]) => string;
  renamePlaylist: (id: string, name: string) => void;
  editPlaylist: (id: string, patch: PlaylistEdit) => void;
  deletePlaylist: (id: string) => void;
  togglePinPlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, track: LikeInput) => boolean;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  linkRemote: (playlistId: string, ytPlaylistId: string) => void;
  unlinkRemote: (playlistId: string) => void;
  importLinkedPlaylist: (id: string, name: string, ytPlaylistId: string, tracks: LikeInput[]) => void;
  restoreTrackInPlaylist: (playlistId: string, track: LibraryTrack, index: number) => void;
  moveInPlaylist: (playlistId: string, from: number, to: number) => void;
  setPlaylistTracks: (playlistId: string, tracks: LibraryTrack[]) => void;
  setPlaylistFolder: (playlistId: string, folderId: string | null) => void;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  togglePinSingle: (key: keyof PinnedSingles) => void;
  setLibraryOrder: (keys: string[]) => void;
};

type Update = (state: LibraryValues) => Partial<LibraryValues>;

const DEFAULTS: LibraryValues = {
  liked: [],
  history: [],
  followedArtists: [],
  pinnedSingles: DEFAULT_PINS,
  playlists: [],
  folders: [],
  savedAlbums: [],
  downloads: {},
  libraryOrder: undefined,
  deletionSync: undefined,
};

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function toLibraryTrack(track: LikeInput, addedAt?: number): LibraryTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumb: track.thumb,
    album: track.album ?? null,
    duration: track.duration ?? 0,
    explicit: track.explicit ?? false,
    ...(addedAt === undefined ? {} : { addedAt }),
  };
}

function liveKeys(state: LibraryValues): Set<string> {
  return new Set([
    ...state.liked.map((track) => deletionKey("liked", track.id)),
    ...state.history.map((track) => deletionKey("history", track.id)),
    ...state.followedArtists.map((artist) => deletionKey("followedArtists", artist.id)),
    ...state.playlists.map((playlist) => deletionKey("playlists", playlist.id)),
    ...state.playlists.flatMap((playlist) =>
      playlist.tracks.map((track) => deletionKey("tracks", track.id, playlist.id)),
    ),
    ...state.folders.map((folder) => deletionKey("folders", folder.id)),
    ...state.savedAlbums.map((album) => deletionKey("savedAlbums", album.id)),
  ]);
}

function commit(
  state: LibraryValues,
  patch: Partial<LibraryValues>,
  changes: DeletionChange[],
): Partial<LibraryValues> {
  const next = { ...state, ...patch };
  return {
    ...patch,
    deletionSync: recordDeletionChanges(
      state.deletionSync ?? emptyDeletionSync(),
      changes,
      liveKeys(next),
      Date.now(),
    ),
  };
}

function likeUpdate(track: LikeInput): Update {
  return (state) => {
    const isLiked = state.liked.some((item) => item.id === track.id);
    const liked = isLiked
      ? state.liked.filter((item) => item.id !== track.id)
      : [toLibraryTrack(track, Date.now()), ...state.liked];
    return commit(state, { liked }, [{ kind: isLiked ? "delete" : "add", group: "liked", id: track.id }]);
  };
}

function likeManyUpdate(tracks: LikeInput[]): Update {
  return (state) => {
    const now = Date.now();
    const seen = new Set(state.liked.map((item) => item.id));
    const fresh: LikeInput[] = [];
    for (const track of tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      fresh.push(track);
    }
    if (fresh.length === 0) return {};
    return commit(
      state,
      { liked: [...fresh.map((track) => toLibraryTrack(track, now)).reverse(), ...state.liked] },
      fresh.map((track): DeletionChange => ({ kind: "add", group: "liked", id: track.id })),
    );
  };
}

function setLikedTracksUpdate(tracks: LibraryTrack[]): Update {
  return (state) => {
    const same = state.liked.length === tracks.length && state.liked.every((item, index) => item.id === tracks[index].id);
    if (same) return {};
    const kept = new Set(tracks.map((item) => item.id));
    const had = new Set(state.liked.map((item) => item.id));
    const changes: DeletionChange[] = [
      ...state.liked
        .filter((item) => !kept.has(item.id))
        .map((item): DeletionChange => ({ kind: "delete", group: "liked", id: item.id })),
      ...tracks
        .filter((item) => !had.has(item.id))
        .map((item): DeletionChange => ({ kind: "add", group: "liked", id: item.id })),
    ];
    return commit(state, { liked: tracks }, changes);
  };
}

function historyUpdate(track: LikeInput): Update {
  return (state) => {
    if (isTestSong(track.id)) return state;
    const history = [toLibraryTrack(track), ...state.history.filter((item) => item.id !== track.id)].slice(
      0,
      HISTORY_LIMIT,
    );
    return commit(state, { history }, [{ kind: "add", group: "history", id: track.id }]);
  };
}

function saveAlbumUpdate(album: SavedAlbumInput): Update {
  return (state) => {
    if (state.savedAlbums.some((item) => item.id === album.id)) return {};
    return commit(state, { savedAlbums: [{ ...album, savedAt: Date.now() }, ...state.savedAlbums] }, [
      { kind: "add", group: "savedAlbums", id: album.id },
    ]);
  };
}

function removeSavedAlbumUpdate(id: string): Update {
  return (state) => {
    if (!state.savedAlbums.some((item) => item.id === id)) return {};
    return commit(state, { savedAlbums: state.savedAlbums.filter((item) => item.id !== id) }, [
      { kind: "delete", group: "savedAlbums", id },
    ]);
  };
}

function mapPlaylist(state: LibraryValues, id: string, change: (playlist: Playlist) => Playlist): Playlist[] {
  return state.playlists.map((playlist) => (playlist.id === id ? change(playlist) : playlist));
}

function pendingUpdate(playlistId: string, change: { add?: string; remove?: string }): Update {
  return (state) => ({
    playlists: mapPlaylist(state, playlistId, (playlist) => {
      if (!playlist.remote) return playlist;
      const current = playlist.pendingYt ?? { add: [], remove: [] };
      const videoId = change.add ?? change.remove ?? "";
      const without = (ids: string[]) => ids.filter((id) => id !== videoId);
      const pendingYt: YtPending = change.add
        ? { add: [...without(current.add), videoId], remove: without(current.remove) }
        : { add: without(current.add), remove: [...without(current.remove), videoId] };
      return { ...playlist, pendingYt };
    }),
  });
}

function hasFolder(state: LibraryValues, folderId: string | null): boolean {
  return folderId === null || state.folders.some((folder) => folder.id === folderId);
}

function createPlaylistUpdate(id: string, name: string): Update {
  return (state) =>
    commit(
      state,
      {
        playlists: [{ id, name: name.trim(), folderId: null, pinned: false, tracks: [] }, ...state.playlists],
      },
      [{ kind: "add", group: "playlists", id }],
    );
}

function editPlaylistUpdate(id: string, patch: PlaylistEdit): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === id);
    if (!playlist) return {};
    const next: Playlist = { ...playlist };
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) return {};
      next.name = trimmed;
    }
    if (patch.description !== undefined) {
      const text = patch.description.trim().slice(0, PLAYLIST_DESCRIPTION_MAX);
      if (text) next.description = text;
      else delete next.description;
    }
    if (patch.coverPath !== undefined) {
      if (patch.coverPath) next.coverPath = patch.coverPath;
      else delete next.coverPath;
    }
    return commit(state, { playlists: mapPlaylist(state, id, () => next) }, [{ kind: "edit", group: "playlists", id }]);
  };
}

function renamePlaylistUpdate(id: string, name: string): Update {
  return (state) => {
    const trimmed = name.trim();
    if (!trimmed || !state.playlists.some((playlist) => playlist.id === id)) return {};
    return commit(
      state,
      { playlists: mapPlaylist(state, id, (playlist) => ({ ...playlist, name: trimmed })) },
      [{ kind: "edit", group: "playlists", id }],
    );
  };
}

function deletePlaylistUpdate(id: string): Update {
  return (state) => {
    if (!state.playlists.some((playlist) => playlist.id === id)) return {};
    return commit(state, { playlists: state.playlists.filter((playlist) => playlist.id !== id) }, [
      { kind: "delete", group: "playlists", id },
    ]);
  };
}

function addTrackUpdate(playlistId: string, track: LikeInput): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist || playlist.tracks.some((item) => item.id === track.id)) return {};
    return commit(
      state,
      {
        playlists: mapPlaylist(state, playlistId, (item) => ({
          ...item,
          tracks: [...item.tracks, toLibraryTrack(track, Date.now())],
        })),
      },
      [{ kind: "add", group: "tracks", id: track.id, parent: playlistId }],
    );
  };
}

function removeTrackUpdate(playlistId: string, trackId: string): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist || !playlist.tracks.some((item) => item.id === trackId)) return {};
    return commit(
      state,
      {
        playlists: mapPlaylist(state, playlistId, (item) => ({
          ...item,
          tracks: item.tracks.filter((track) => track.id !== trackId),
        })),
      },
      [{ kind: "delete", group: "tracks", id: trackId, parent: playlistId }],
    );
  };
}

function restoreTrackUpdate(playlistId: string, track: LibraryTrack, index: number): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist || playlist.tracks.some((item) => item.id === track.id)) return {};
    return commit(
      state,
      {
        playlists: mapPlaylist(state, playlistId, (item) => {
          const tracks = [...item.tracks];
          tracks.splice(Math.min(Math.max(index, 0), tracks.length), 0, track);
          return { ...item, tracks };
        }),
      },
      [{ kind: "add", group: "tracks", id: track.id, parent: playlistId }],
    );
  };
}

function movePlaylistTrackUpdate(playlistId: string, from: number, to: number): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist || to < 0 || to >= playlist.tracks.length || from === to) return {};
    return commit(
      state,
      {
        playlists: mapPlaylist(state, playlistId, (item) => ({
          ...item,
          tracks: moveKey(item.tracks, from, to),
        })),
      },
      [{ kind: "edit", group: "playlists", id: playlistId }],
    );
  };
}

function notifyPlaylistTracksAdded(playlistId: string, added: string[]) {
  void import("../lib/downloads").then(({ autoDownloadAdded }) => {
    const playlist = useLibrary.getState().playlists.find((item) => item.id === playlistId);
    if (playlist) autoDownloadAdded(playlist.tracks, added);
  });
}

function setPlaylistTracksUpdate(playlistId: string, tracks: LibraryTrack[]): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist) return {};
    const same =
      playlist.tracks.length === tracks.length && playlist.tracks.every((item, index) => item.id === tracks[index].id);
    if (same) return {};
    const kept = new Set(tracks.map((item) => item.id));
    const had = new Set(playlist.tracks.map((item) => item.id));
    const changes: DeletionChange[] = [
      ...playlist.tracks
        .filter((item) => !kept.has(item.id))
        .map((item): DeletionChange => ({ kind: "delete", group: "tracks", id: item.id, parent: playlistId })),
      ...tracks
        .filter((item) => !had.has(item.id))
        .map((item): DeletionChange => ({ kind: "add", group: "tracks", id: item.id, parent: playlistId })),
    ];
    if (changes.length === 0) changes.push({ kind: "edit", group: "playlists", id: playlistId });
    return commit(state, { playlists: mapPlaylist(state, playlistId, (item) => ({ ...item, tracks })) }, changes);
  };
}

function setPlaylistFolderUpdate(playlistId: string, folderId: string | null): Update {
  return (state) => {
    const playlist = state.playlists.find((item) => item.id === playlistId);
    if (!playlist || playlist.folderId === folderId || !hasFolder(state, folderId)) return {};
    return commit(
      state,
      { playlists: mapPlaylist(state, playlistId, (item) => ({ ...item, folderId })) },
      [{ kind: "edit", group: "playlists", id: playlistId }],
    );
  };
}

function createFolderUpdate(id: string, name: string): Update {
  return (state) =>
    commit(state, { folders: [{ id, name: name.trim() }, ...state.folders] }, [
      { kind: "add", group: "folders", id },
    ]);
}

function renameFolderUpdate(id: string, name: string): Update {
  return (state) => {
    const trimmed = name.trim();
    if (!trimmed || !state.folders.some((folder) => folder.id === id)) return {};
    return commit(
      state,
      { folders: state.folders.map((folder) => (folder.id === id ? { ...folder, name: trimmed } : folder)) },
      [{ kind: "edit", group: "folders", id }],
    );
  };
}

function deleteFolderUpdate(id: string): Update {
  return (state) => {
    if (!state.folders.some((folder) => folder.id === id)) return {};
    const moved = state.playlists.filter((playlist) => playlist.folderId === id);
    return commit(
      state,
      {
        folders: state.folders.filter((folder) => folder.id !== id),
        playlists: state.playlists.map((playlist) =>
          playlist.folderId === id ? { ...playlist, folderId: null } : playlist,
        ),
      },
      [
        { kind: "delete", group: "folders", id },
        ...moved.map((playlist): DeletionChange => ({ kind: "edit", group: "playlists", id: playlist.id })),
      ],
    );
  };
}

export function normalizePlaylist(playlist: Playlist): Playlist {
  const { description, coverPath, ...rest } = playlist;
  const text = typeof description === "string" ? description.trim().slice(0, PLAYLIST_DESCRIPTION_MAX) : "";
  const cover = typeof coverPath === "string" && coverPath.length > 0 ? coverPath : undefined;
  return {
    ...rest,
    ...(text ? { description: text } : {}),
    ...(cover ? { coverPath: cover } : {}),
  };
}

function isSavedAlbum(value: unknown): value is SavedAlbum {
  if (typeof value !== "object" || value === null) return false;
  const album = value as Partial<SavedAlbum>;
  return (
    typeof album.id === "string" &&
    album.id.length > 0 &&
    typeof album.title === "string" &&
    typeof album.artist === "string" &&
    typeof album.savedAt === "number"
  );
}

function migrateLibrary(persisted: unknown, version: number): LibraryValues {
  const stored = (typeof persisted === "object" && persisted !== null ? persisted : {}) as Partial<LibraryValues>;
  return {
    liked: stored.liked ?? [],
    history: (stored.history ?? []).filter((track) => !isTestSong(track.id)),
    followedArtists: stored.followedArtists ?? [],
    pinnedSingles: version < 1 || stored.pinnedSingles == null ? DEFAULT_PINS : stored.pinnedSingles,
    playlists: (stored.playlists ?? []).map(normalizePlaylist),
    folders: stored.folders ?? [],
    savedAlbums: version < 7 || !Array.isArray(stored.savedAlbums) ? [] : stored.savedAlbums.filter(isSavedAlbum),
    downloads: stored.downloads ?? {},
    libraryOrder: stored.libraryOrder ?? undefined,
    deletionSync: stored.deletionSync == null ? undefined : rekeyPlaylistTracks(readDeletionSync(stored.deletionSync)),
  };
}

let hydrated = false;
const buffered: Update[] = [];

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => {
      const apply = (update: Update) => {
        if (hydrated) set(update);
        else buffered.push(update);
      };
      return {
        ...DEFAULTS,
        likeMany: (tracks) => {
          const liked = new Set(get().liked.map((item) => item.id));
          const fresh = [...new Map(tracks.filter((track) => !liked.has(track.id)).map((track) => [track.id, track])).values()];
          if (fresh.length === 0) return 0;
          apply(likeManyUpdate(tracks));
          for (const track of fresh) rateYtSong(track, true);
          return fresh.length;
        },
        toggleLike: (track) => {
          const wasLiked = get().liked.some((item) => item.id === track.id);
          apply(likeUpdate(track));
          rateYtSong(track, !wasLiked);
          void scrobbleLove(track.artist, track.title, !wasLiked).catch(() => {});
          if (!wasLiked) {
            void import("../lib/downloads").then(({ autoDownloadLiked }) =>
              autoDownloadLiked({
                id: track.id,
                title: track.title,
                artist: track.artist,
                thumb: track.thumb,
                album: track.album,
                duration: track.duration,
              }),
            );
          }
        },
        setLikedTracks: (tracks) => apply(setLikedTracksUpdate(tracks)),
        importLikedTracks: (tracks) => apply((state) => {
          const known = new Set(state.liked.map((track) => track.id));
          const fresh = tracks.filter((track) => {
            if (known.has(track.id)) return false;
            known.add(track.id);
            return true;
          });
          if (fresh.length === 0) return {};
          const imported = fresh.map((track) => toLibraryTrack(track, Date.now()));
          return commit(state, { liked: [...imported, ...state.liked] }, fresh.map((track) => ({ kind: "add", group: "liked", id: track.id })));
        }),
        pushHistory: (track) => {
          if (useSettings.getState().pauseListeningHistory) return;
          apply(historyUpdate(track));
        },
        clearHistory: () =>
          set((state) => commit(state, { history: [] }, [{ kind: "clear", group: "history" }])),
        removeFromHistory: (id) =>
          set((state) =>
            commit(state, { history: state.history.filter((item) => item.id !== id) }, [
              { kind: "delete", group: "history", id },
            ]),
          ),
        followArtist: (artist) => {
          if (get().followedArtists.some((item) => item.id === artist.id)) return false;
          set((state) =>
            commit(
              state,
              { followedArtists: [{ ...artist, followedAt: Date.now() }, ...state.followedArtists] },
              [{ kind: "add", group: "followedArtists", id: artist.id }],
            ),
          );
          return true;
        },
        unfollowArtist: (id) =>
          set((state) =>
            commit(
              state,
              { followedArtists: state.followedArtists.filter((item) => item.id !== id) },
              [{ kind: "delete", group: "followedArtists", id }],
            ),
          ),
        createPlaylist: (name) => {
          const id = newId();
          apply(createPlaylistUpdate(id, name));
          queueYtJobs([{ kind: "create", localPlaylistId: id, payload: name.trim() }]);
          return id;
        },
        createPlaylistWith: (name, tracks) => {
          const id = newId();
          const unique = tracks.filter((track, index) => tracks.findIndex((other) => other.id === track.id) === index);
          const libraryTracks = unique.map((track) => toLibraryTrack(track, Date.now()));
          apply((state) =>
            commit(
              state,
              {
                playlists: [{ id, name: name.trim(), folderId: null, pinned: false, tracks: libraryTracks }, ...state.playlists],
              },
              [
                { kind: "add", group: "playlists", id },
                ...libraryTracks.map((track) => ({ kind: "add" as const, group: "tracks" as const, id: track.id, parent: id })),
              ],
            ),
          );
          const jobs: YtSyncJob[] = [{ kind: "create", localPlaylistId: id, payload: name.trim() }];
          for (const track of unique) {
            const videoId = videoIdOf(track);
            if (videoId) jobs.push({ kind: "add", localPlaylistId: id, videoId });
          }
          queueYtJobs(jobs);
          if (libraryTracks.length > 0) notifyPlaylistTracksAdded(id, libraryTracks.map((track) => track.id));
          return id;
        },
        renamePlaylist: (id, name) => {
          apply(renamePlaylistUpdate(id, name));
          const trimmed = name.trim();
          if (trimmed) queueYtJobs([{ kind: "rename", localPlaylistId: id, payload: trimmed }]);
        },
        editPlaylist: (id, patch) => {
          apply(editPlaylistUpdate(id, patch));
          const trimmed = patch.name?.trim();
          if (trimmed) queueYtJobs([{ kind: "rename", localPlaylistId: id, payload: trimmed }]);
        },
        deletePlaylist: (id) => {
          const remote = get().playlists.find((playlist) => playlist.id === id)?.remote;
          apply(deletePlaylistUpdate(id));
          void playlistCoverRemove(id).catch(() => {});
          if (remote?.imported) {
            unlinkYtPlaylist(id);
            return;
          }
          queueYtJobs([{ kind: "delete", localPlaylistId: id, ytPlaylistId: remote?.ytPlaylistId ?? null }]);
        },
        linkRemote: (playlistId, ytPlaylistId) =>
          apply((state) => ({
            playlists: mapPlaylist(state, playlistId, (playlist) => ({ ...playlist, remote: { ytPlaylistId } })),
          })),
        unlinkRemote: (playlistId) =>
          apply((state) => ({
            playlists: mapPlaylist(state, playlistId, (playlist) => ({ ...playlist, remote: undefined, pendingYt: undefined })),
          })),
        importLinkedPlaylist: (id, name, ytPlaylistId, tracks) => {
          const unique = tracks.filter((track, index) => tracks.findIndex((other) => other.id === track.id) === index);
          const libraryTracks = unique.map(toLibraryTrack);
          apply((state) => {
            const existing = state.playlists.find((playlist) => playlist.remote?.ytPlaylistId === ytPlaylistId);
            if (existing) {
              const merged = mergeYtRemote(existing.tracks, libraryTracks, existing.pendingYt);
              const currentIds = new Set(existing.tracks.map((track) => track.id));
              const nextIds = new Set(merged.tracks.map((track) => track.id));
              const changes: DeletionChange[] = [
                ...existing.tracks
                  .filter((track) => !nextIds.has(track.id))
                  .map((track): DeletionChange => ({ kind: "delete", group: "tracks", id: track.id, parent: existing.id })),
                ...merged.tracks
                  .filter((track) => !currentIds.has(track.id))
                  .map((track): DeletionChange => ({ kind: "add", group: "tracks", id: track.id, parent: existing.id })),
              ];
              return commit(
                state,
                {
                  playlists: mapPlaylist(state, existing.id, (playlist) => ({
                    ...playlist,
                    name: name.trim(),
                    tracks: merged.tracks,
                    pendingYt: merged.pending,
                    remote: { ytPlaylistId, imported: true, refreshedAt: Date.now() },
                  })),
                },
                changes,
              );
            }
            return commit(
              state,
              {
                playlists: [
                  {
                    id,
                    name: name.trim(),
                    folderId: null,
                    pinned: false,
                    tracks: libraryTracks,
                    remote: { ytPlaylistId, imported: true, refreshedAt: Date.now() },
                  },
                  ...state.playlists,
                ],
              },
              [
                { kind: "add", group: "playlists", id },
                ...libraryTracks.map((track) => ({ kind: "add" as const, group: "tracks" as const, id: track.id, parent: id })),
              ],
            );
          });
        },
        togglePinPlaylist: (id) =>
          apply((state) => ({
            playlists: mapPlaylist(state, id, (playlist) => ({ ...playlist, pinned: !playlist.pinned })),
          })),
        addToPlaylist: (playlistId, track) => {
          const playlist = get().playlists.find((item) => item.id === playlistId);
          if (!playlist || playlist.tracks.some((item) => item.id === track.id)) return false;
          apply(addTrackUpdate(playlistId, track));
          const videoId = videoIdOf(track);
          if (videoId) {
            queueYtJobs([{ kind: "add", localPlaylistId: playlistId, videoId }]);
            apply(pendingUpdate(playlistId, { add: videoId }));
          }
          notifyPlaylistTracksAdded(playlistId, [track.id]);
          return true;
        },
        removeFromPlaylist: (playlistId, trackId) => {
          const track = get().playlists
            .find((playlist) => playlist.id === playlistId)
            ?.tracks.find((item) => item.id === trackId);
          apply(removeTrackUpdate(playlistId, trackId));
          const videoId = track && videoIdOf(track);
          if (videoId) {
            queueYtJobs([{ kind: "remove", localPlaylistId: playlistId, videoId }]);
            apply(pendingUpdate(playlistId, { remove: videoId }));
          }
        },
        restoreTrackInPlaylist: (playlistId, track, index) => {
          const playlist = get().playlists.find((item) => item.id === playlistId);
          if (!playlist || playlist.tracks.some((item) => item.id === track.id)) return;
          apply(restoreTrackUpdate(playlistId, track, index));
          const videoId = videoIdOf(track);
          if (videoId) {
            queueYtJobs([{ kind: "add", localPlaylistId: playlistId, videoId }]);
            apply(pendingUpdate(playlistId, { add: videoId }));
          }
        },
        moveInPlaylist: (playlistId, from, to) => {
          const playlist = get().playlists.find((item) => item.id === playlistId);
          const track = playlist?.tracks[from];
          apply(movePlaylistTrackUpdate(playlistId, from, to));
          if (!playlist?.remote || !track || from === to) return;
          const tracks = get().playlists.find((item) => item.id === playlistId)?.tracks ?? [];
          const next = tracks[to + 1];
          const previous = tracks[to - 1];
          const neighbour = next ? { track: next, after: false } : previous ? { track: previous, after: true } : null;
          queueYtMove(ytMoveJob(playlistId, track, neighbour));
        },
        setPlaylistTracks: (playlistId, tracks) => {
          const before = new Set(get().playlists.find((item) => item.id === playlistId)?.tracks.map((item) => item.id));
          apply(setPlaylistTracksUpdate(playlistId, tracks));
          const added = tracks.filter((item) => !before.has(item.id)).map((item) => item.id);
          if (added.length > 0) notifyPlaylistTracksAdded(playlistId, added);
        },
        setPlaylistFolder: (playlistId, folderId) => apply(setPlaylistFolderUpdate(playlistId, folderId)),
        createFolder: (name) => {
          const id = newId();
          apply(createFolderUpdate(id, name));
          return id;
        },
        renameFolder: (id, name) => apply(renameFolderUpdate(id, name)),
        deleteFolder: (id) => apply(deleteFolderUpdate(id)),
        saveAlbum: (album) => apply(saveAlbumUpdate(album)),
        removeSavedAlbum: (id) => apply(removeSavedAlbumUpdate(id)),
        togglePinSingle: (key) =>
          apply((state) => ({ pinnedSingles: { ...state.pinnedSingles, [key]: !state.pinnedSingles[key] } })),
        setLibraryOrder: (keys) => apply(() => ({ libraryOrder: [...keys] })),
        setDownload: (id, item) => apply((state) => ({ downloads: { ...state.downloads, [id]: item } })),
        patchDownload: (id, patch) =>
          apply((state) => {
            const current = state.downloads[id];
            return current ? { downloads: { ...state.downloads, [id]: { ...current, ...patch } } } : {};
          }),
        removeDownload: (id) =>
          apply((state) => {
            const downloads = { ...state.downloads };
            delete downloads[id];
            return { downloads };
          }),
      };
    },
    {
      name: "library",
      version: LIBRARY_VERSION,
      storage: persistStorage<LibraryValues>("library"),
      partialize: (state): LibraryValues => ({
        liked: state.liked,
        history: state.history,
        followedArtists: state.followedArtists,
        pinnedSingles: state.pinnedSingles,
        playlists: state.playlists,
        folders: state.folders,
        savedAlbums: state.savedAlbums,
        downloads: state.downloads,
        libraryOrder: state.libraryOrder,
        deletionSync: state.deletionSync,
      }),
      migrate: migrateLibrary,
      onRehydrateStorage: () => () => {
        hydrated = true;
        for (const update of buffered.splice(0)) useLibrary.setState(update);
      },
    },
  ),
);

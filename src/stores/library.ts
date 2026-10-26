import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  deletionKey,
  type DeletionChange,
  type DeletionSync,
  emptyDeletionSync,
  readDeletionSync,
  recordDeletionChanges,
} from "../lib/deletionSync";
import { persistStorage } from "../lib/persist";
import type { Track } from "../types";

export const HISTORY_LIMIT = 200;
const LIBRARY_VERSION = 1;

export type LibraryTrack = Track & { album: string | null; duration: number; explicit: boolean };
export type LikeInput = Track & Partial<Pick<LibraryTrack, "album" | "duration" | "explicit">>;

export type FollowedArtist = { id: string; name: string; thumb?: string; followedAt: number };
export type ArtistInput = Omit<FollowedArtist, "followedAt">;

export type PinnedSingles = {
  liked: boolean;
  spotify: boolean;
  replay: boolean;
  downloads: boolean;
  local: boolean;
  v2: boolean;
};

export const DEFAULT_PINS: PinnedSingles = {
  liked: true,
  spotify: true,
  replay: true,
  downloads: false,
  local: false,
  v2: true,
};

type LibraryValues = {
  liked: LibraryTrack[];
  history: LibraryTrack[];
  followedArtists: FollowedArtist[];
  pinnedSingles: PinnedSingles;
  deletionSync: DeletionSync | undefined;
};

type LibraryState = LibraryValues & {
  toggleLike: (track: LikeInput) => void;
  pushHistory: (track: LikeInput) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
  followArtist: (artist: ArtistInput) => boolean;
  unfollowArtist: (id: string) => void;
};

type Update = (state: LibraryValues) => Partial<LibraryValues>;

const DEFAULTS: LibraryValues = {
  liked: [],
  history: [],
  followedArtists: [],
  pinnedSingles: DEFAULT_PINS,
  deletionSync: undefined,
};

function toLibraryTrack(track: LikeInput): LibraryTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    thumb: track.thumb,
    album: track.album ?? null,
    duration: track.duration ?? 0,
    explicit: track.explicit ?? false,
  };
}

function liveKeys(state: LibraryValues): Set<string> {
  return new Set([
    ...state.liked.map((track) => deletionKey("liked", track.id)),
    ...state.history.map((track) => deletionKey("history", track.id)),
    ...state.followedArtists.map((artist) => deletionKey("followedArtists", artist.id)),
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
      : [toLibraryTrack(track), ...state.liked];
    return commit(state, { liked }, [{ kind: isLiked ? "delete" : "add", group: "liked", id: track.id }]);
  };
}

function historyUpdate(track: LikeInput): Update {
  return (state) => {
    const history = [toLibraryTrack(track), ...state.history.filter((item) => item.id !== track.id)].slice(
      0,
      HISTORY_LIMIT,
    );
    return commit(state, { history }, [{ kind: "add", group: "history", id: track.id }]);
  };
}

function migrateLibrary(persisted: unknown, version: number): LibraryValues {
  const stored = (typeof persisted === "object" && persisted !== null ? persisted : {}) as Partial<LibraryValues>;
  return {
    liked: stored.liked ?? [],
    history: stored.history ?? [],
    followedArtists: stored.followedArtists ?? [],
    pinnedSingles: version < 1 || stored.pinnedSingles == null ? DEFAULT_PINS : stored.pinnedSingles,
    deletionSync: stored.deletionSync == null ? undefined : readDeletionSync(stored.deletionSync),
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
        toggleLike: (track) => apply(likeUpdate(track)),
        pushHistory: (track) => apply(historyUpdate(track)),
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

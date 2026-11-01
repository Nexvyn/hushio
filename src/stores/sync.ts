import { create } from "zustand";
import {
  listenYtPlaylistLinked,
  listenYtSyncProgress,
  ytSyncNow,
  ytSyncStatus,
  type YtSyncStatus,
} from "../lib/bridge";
import { useLibrary } from "./library";
import { useUI } from "./ui";

export const IDLE_SYNC: YtSyncStatus = {
  state: "idle",
  done: 0,
  total: 0,
  playlistName: null,
  backend: "official",
  quotaUsedToday: 0,
  quotaLimit: 10_000,
  failedJobs: 0,
  lastError: null,
  lastSyncedAt: null,
  pulledPlaylists: 0,
};

type SyncState = {
  status: YtSyncStatus;
  load: () => Promise<void>;
  syncNow: () => Promise<void>;
  apply: (status: YtSyncStatus) => void;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const useSync = create<SyncState>()((set) => ({
  status: IDLE_SYNC,

  load: async () => {
    try {
      set({ status: await ytSyncStatus() });
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  syncNow: async () => {
    try {
      set({ status: await ytSyncNow() });
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  apply: (status) => set({ status }),
}));

export function startYtSync(): () => void {
  let live = true;
  const stops: (() => void)[] = [];
  const keep = (subscribe: Promise<() => void>) => {
    subscribe
      .then((unlisten) => {
        if (live) stops.push(unlisten);
        else unlisten();
      })
      .catch((error: unknown) => useUI.getState().toast(errorText(error), "error"));
  };
  keep(listenYtSyncProgress((status) => useSync.getState().apply(status)));
  keep(
    listenYtPlaylistLinked(({ localPlaylistId, ytPlaylistId }) =>
      useLibrary.getState().linkRemote(localPlaylistId, ytPlaylistId),
    ),
  );
  void useSync.getState().load();
  return () => {
    live = false;
    stops.forEach((stop) => stop());
  };
}

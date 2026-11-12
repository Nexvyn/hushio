import { create } from "zustand";
import {
  listenYtPlaylistLinked,
  listenYtSyncProgress,
  listenYtTvCode,
  ytSyncNow,
  ytSyncStatus,
  ytTvCancel,
  ytTvConnect,
  ytTvDisconnect,
  ytTvOpen,
  ytTvStatus,
  type YtSyncStatus,
  type YtTvCode,
} from "../lib/bridge";
import { useLibrary } from "./library";
import { useSettings } from "./settings";
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
  tvConnected: boolean;
  tvCode: YtTvCode | null;
  tvBusy: boolean;
  tvError: string | null;
  load: () => Promise<void>;
  syncNow: () => Promise<void>;
  apply: (status: YtSyncStatus) => void;
  loadTv: () => Promise<void>;
  connectTv: () => Promise<void>;
  cancelTv: () => Promise<void>;
  disconnectTv: () => Promise<void>;
  openTv: () => Promise<void>;
  applyTvCode: (code: YtTvCode) => void;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const useSync = create<SyncState>()((set, get) => ({
  status: IDLE_SYNC,
  tvConnected: false,
  tvCode: null,
  tvBusy: false,
  tvError: null,

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

  loadTv: async () => {
    try {
      set({ tvConnected: (await ytTvStatus()).connected });
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  connectTv: async () => {
    if (get().tvBusy) return;
    set({ tvBusy: true, tvError: null });
    try {
      const status = await ytTvConnect();
      set({ tvConnected: status.connected });
    } catch (error) {
      set({ tvError: errorText(error) });
    } finally {
      set({ tvBusy: false, tvCode: null });
    }
  },

  cancelTv: async () => {
    try {
      await ytTvCancel();
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  disconnectTv: async () => {
    try {
      const status = await ytTvDisconnect();
      set({ tvConnected: status.connected, tvError: null });
      useSettings.getState().setValue("unlimitedSync", false);
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  openTv: async () => {
    try {
      await ytTvOpen();
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  applyTvCode: (tvCode) => set({ tvCode }),
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
  keep(listenYtTvCode((code) => useSync.getState().applyTvCode(code)));
  void useSync.getState().load();
  void useSync.getState().loadTv();
  return () => {
    live = false;
    stops.forEach((stop) => stop());
  };
}

import { create } from "zustand";
import {
  driveSyncNow,
  driveSyncStatus,
  listenDriveSyncProgress,
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
  type DriveSyncStatus,
  type YtSyncStatus,
  type YtTvCode,
} from "../lib/bridge";
import { useArtistMeta } from "./artistMeta";
import { useLibrary } from "./library";
import { useRecents } from "./recents";
import { useSettings } from "./settings";
import { useUI } from "./ui";

export const IDLE_DRIVE: DriveSyncStatus = {
  mode: "google",
  lastSyncAt: null,
  restoreSeq: 0,
  restoredStores: [],
  state: "idle",
  lastError: null,
  pending: 0,
};

const REHYDRATE: Record<string, () => void> = {
  settings: () => void useSettings.persist.rehydrate(),
  library: () => void useLibrary.persist.rehydrate(),
  "recent-searches": () => void useRecents.persist.rehydrate(),
  "artist-meta-cache": () => void useArtistMeta.persist.rehydrate(),
};

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
  drive: DriveSyncStatus;
  tvConnected: boolean;
  tvCode: YtTvCode | null;
  tvBusy: boolean;
  tvError: string | null;
  load: () => Promise<void>;
  syncNow: () => Promise<void>;
  apply: (status: YtSyncStatus) => void;
  loadDrive: () => Promise<void>;
  syncDriveNow: () => Promise<void>;
  applyDrive: (status: DriveSyncStatus) => void;
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
  drive: IDLE_DRIVE,
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

  loadDrive: async () => {
    try {
      set({ drive: await driveSyncStatus() });
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  syncDriveNow: async () => {
    try {
      set({ drive: await driveSyncNow() });
    } catch (error) {
      useUI.getState().toast(errorText(error), "error");
    }
  },

  applyDrive: (drive) => {
    const previous = get().drive.restoreSeq;
    set({ drive });
    if (drive.restoreSeq !== previous) {
      for (const store of drive.restoredStores) REHYDRATE[store]?.();
    }
  },

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
  keep(listenDriveSyncProgress((status) => useSync.getState().applyDrive(status)));
  void useSync.getState().load();
  void useSync.getState().loadTv();
  void useSync.getState().loadDrive();
  return () => {
    live = false;
    stops.forEach((stop) => stop());
  };
}

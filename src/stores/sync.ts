import { create } from "zustand";
import {
  listenYtPlaylistLinked,
  listenYtSyncProgress,
  listenYtTvCode,
  ytMyPlaylists,
  ytPlaylistVideos,
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
import { isYtRefreshDue, mapLimited, remoteVideoTrack, skippedText, unlinkYtPlaylist, YT_REFRESH_CONCURRENCY } from "../lib/ytSync";
import { useAuth } from "./auth";
import { useLibrary } from "./library";
import { useSettings } from "./settings";
import { useUI } from "./ui";

let refreshing = false;

export async function refreshStaleYtPlaylists(now = Date.now()): Promise<void> {
  if (refreshing || useAuth.getState().account.mode !== "google") return;
  const due = useLibrary.getState().playlists.filter(
    (playlist) => playlist.remote && isYtRefreshDue(playlist.remote.refreshedAt, now),
  );
  if (due.length === 0) return;
  refreshing = true;
  try {
    const remote = new Map((await ytMyPlaylists()).map((item) => [item.id, item]));
    const live = [];
    for (const playlist of due) {
      if (!playlist.remote) continue;
      if (remote.has(playlist.remote.ytPlaylistId)) {
        live.push(playlist);
        continue;
      }
      useLibrary.getState().unlinkRemote(playlist.id);
      unlinkYtPlaylist(playlist.id);
      useUI.getState().toast("This playlist was deleted on YouTube. Kept a copy here.", "warning");
    }
    let skipped = 0;
    await mapLimited(live, YT_REFRESH_CONCURRENCY, async (playlist) => {
      const ytPlaylistId = playlist.remote?.ytPlaylistId ?? "";
      try {
        const videos = await ytPlaylistVideos(ytPlaylistId);
        useLibrary.getState().importLinkedPlaylist(playlist.id, playlist.name, ytPlaylistId, videos.map(remoteVideoTrack));
        skipped += Math.max(0, (remote.get(ytPlaylistId)?.count ?? 0) - videos.length);
      } catch (error) {
        console.warn("Couldn't refresh a YouTube playlist.", error);
      }
    });
    const text = skippedText(skipped);
    if (text) useUI.getState().toast(text, "info");
  } catch (error) {
    console.warn("Couldn't check YouTube playlists.", error);
  } finally {
    refreshing = false;
  }
}

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
  if (useAuth.getState().loaded) {
    void refreshStaleYtPlaylists();
  } else {
    const unsubscribe = useAuth.subscribe((state) => {
      if (!state.loaded) return;
      unsubscribe();
      void refreshStaleYtPlaylists();
    });
    stops.push(unsubscribe);
  }
  return () => {
    live = false;
    stops.forEach((stop) => stop());
  };
}

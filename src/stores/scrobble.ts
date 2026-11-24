import { create } from "zustand";
import {
  lastfmBeginAuth,
  lastfmDisconnect,
  lastfmFinishAuth,
  listenbrainzConnect,
  listenbrainzDisconnect,
  scrobbleSetEnabled,
  scrobbleStatus,
  type ScrobbleStatus,
} from "../lib/bridge";
import { useUI } from "./ui";

const EMPTY: ScrobbleStatus = {
  lastfm: { available: false, connected: false, username: null, enabled: false, awaitingApproval: false, reconnect: false },
  listenbrainz: { available: false, connected: false, username: null, enabled: false, awaitingApproval: false, reconnect: false },
};

type ScrobbleState = {
  status: ScrobbleStatus;
  busy: boolean;
  load: () => Promise<void>;
  setEnabled: (service: "lastfm" | "listenbrainz", enabled: boolean) => Promise<void>;
  connectListenbrainz: (token: string) => Promise<void>;
  disconnectListenbrainz: () => Promise<void>;
  beginLastfm: () => Promise<void>;
  finishLastfm: () => Promise<void>;
  disconnectLastfm: () => Promise<void>;
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const useScrobble = create<ScrobbleState>()((set) => ({
  status: EMPTY,
  busy: false,

  load: async () => {
    const status = await scrobbleStatus().catch(() => null);
    if (status) set({ status });
  },

  setEnabled: async (service, enabled) => {
    const status = await scrobbleSetEnabled(service, enabled).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't change that setting."), "error");
      return null;
    });
    if (status) set({ status });
  },

  connectListenbrainz: async (token) => {
    set({ busy: true });
    const status = await listenbrainzConnect(token).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't connect to ListenBrainz."), "error");
      return null;
    });
    set({ busy: false });
    if (!status) return;
    set({ status });
    useUI.getState().toast(`Connected to ListenBrainz as ${status.listenbrainz.username ?? "you"}.`, "success");
  },

  disconnectListenbrainz: async () => {
    const status = await listenbrainzDisconnect().catch(() => null);
    if (status) set({ status });
  },

  beginLastfm: async () => {
    set({ busy: true });
    const status = await lastfmBeginAuth().catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't start Last.fm sign-in."), "error");
      return null;
    });
    set({ busy: false });
    if (!status) return;
    set({ status });
    useUI.getState().toast("Allow access in the browser, then finish connecting.", "info");
  },

  finishLastfm: async () => {
    set({ busy: true });
    const status = await lastfmFinishAuth().catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't finish Last.fm sign-in."), "error");
      return null;
    });
    set({ busy: false });
    if (!status) return;
    set({ status });
    useUI.getState().toast(`Connected to Last.fm as ${status.lastfm.username ?? "you"}.`, "success");
  },

  disconnectLastfm: async () => {
    const status = await lastfmDisconnect().catch(() => null);
    if (status) set({ status });
  },
}));

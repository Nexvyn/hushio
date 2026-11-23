import { create } from "zustand";
import {
  networkServerRefresh,
  networkServerRemove,
  networkServerSave,
  networkServerTest,
  networkServers,
  networkTracks,
  type NetworkServer,
  type NetworkServerInput,
  type NetworkTrack,
} from "../lib/bridge";
import { useUI } from "./ui";

type NetworkState = {
  servers: NetworkServer[];
  tracks: Record<string, NetworkTrack[]>;
  busy: boolean;
  load: () => Promise<void>;
  save: (server: NetworkServerInput) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  refresh: (id: string) => Promise<void>;
  test: (server: NetworkServerInput) => Promise<{ ok: boolean; message: string }>;
  loadTracks: (id: string, path: string) => Promise<NetworkTrack[]>;
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const useNetwork = create<NetworkState>()((set, get) => ({
  servers: [],
  tracks: {},
  busy: false,

  load: async () => {
    const servers = await networkServers().catch(() => null);
    if (servers) set({ servers });
  },

  save: async (server) => {
    set({ busy: true });
    const servers = await networkServerSave(server).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't save that server."), "error");
      return null;
    });
    set({ busy: false });
    if (!servers) return false;
    set({ servers });
    return true;
  },

  remove: async (id) => {
    const servers = await networkServerRemove(id).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't remove that server."), "error");
      return null;
    });
    if (!servers) return;
    const { [id]: _removed, ...tracks } = get().tracks;
    set({ servers, tracks });
  },

  refresh: async (id) => {
    const servers = await networkServerRefresh(id).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't refresh that server."), "error");
      return null;
    });
    if (servers) set({ servers });
  },

  test: async (server) => {
    try {
      return { ok: true, message: await networkServerTest(server) };
    } catch (error) {
      return { ok: false, message: messageOf(error, "Couldn't reach the server.") };
    }
  },

  loadTracks: async (id, path) => {
    const tracks = await networkTracks(id, path).catch((error: unknown) => {
      useUI.getState().toast(messageOf(error, "Couldn't read that folder."), "error");
      return null;
    });
    if (!tracks) return [];
    set((state) => ({ tracks: { ...state.tracks, [id]: tracks } }));
    return tracks;
  },
}));

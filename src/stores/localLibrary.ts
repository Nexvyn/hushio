import { create } from "zustand";
import {
  localLibraryAddFolders,
  localLibraryEditTags,
  localLibraryFolderStatuses,
  localLibraryForgetOpened,
  localLibraryGet,
  localLibraryOpened,
  localLibraryOpenFiles,
  localLibraryRemoveFolder,
  localLibraryRenameFolder,
  localLibraryScan,
  onLocalLibraryChanged,
  pickFolder,
  type LocalLibrary,
  type LocalOpenResult,
  type LocalTagEdits,
  type LocalTrack,
} from "../lib/bridge";
import { APP_NAME } from "../lib/app";
import { toTrack, unplayableToast } from "../lib/localLibrary";
import { usePlayer } from "./player";
import { useSettings } from "./settings";
import { useUI } from "./ui";

const EMPTY_LIBRARY: LocalLibrary = { folders: [], scannedAt: 0, tracks: [], unplayable: [] };

let watching = false;
let rescanQueued = false;

type LocalLibraryState = {
  library: LocalLibrary;
  opened: LocalTrack[];
  missing: string[];
  loaded: boolean;
  scanning: boolean;
  refresh: () => Promise<void>;
  scan: () => Promise<void>;
  rescan: (announce: boolean) => Promise<void>;
  startupRescan: () => Promise<void>;
  importFolders: (paths: string[]) => Promise<void>;
  importFromPicker: () => Promise<void>;
  remove: (path: string) => Promise<void>;
  rename: (path: string, displayName: string) => Promise<void>;
  forgetOpened: (id: string) => Promise<void>;
  openFiles: (paths: string[]) => Promise<LocalOpenResult>;
  editTags: (id: string, edits: LocalTagEdits) => Promise<LocalTrack>;
};

function toast(message: string, kind: "info" | "success" | "error" | "warning" = "info") {
  useUI.getState().toast(message, kind);
}

function warnUnplayable(library: LocalLibrary) {
  if (library.unplayable.length === 0) return;
  toast(unplayableToast(library.unplayable.map((item) => item.format)), "warning");
}

export const useLocalLibrary = create<LocalLibraryState>()((set, get) => ({
  library: EMPTY_LIBRARY,
  opened: [],
  missing: [],
  loaded: false,
  scanning: false,

  refresh: async () => {
    try {
      const [library, opened, statuses] = await Promise.all([
        localLibraryGet(),
        localLibraryOpened(),
        localLibraryFolderStatuses(),
      ]);
      set({
        library,
        opened,
        missing: statuses.filter((status) => !status.exists).map((status) => status.path),
        loaded: true,
      });
    } catch {
      toast("Couldn't load your local music", "error");
    }
  },

  scan: () => get().rescan(true),

  rescan: async (announce) => {
    set({ scanning: true });
    try {
      const library = await localLibraryScan(useSettings.getState().filterNonMusicAudio);
      set({ library });
      await get().refresh();
      if (announce) toast("Local library scanned", "success");
      warnUnplayable(library);
    } catch {
      toast("Scan failed", "error");
    } finally {
      set({ scanning: false });
      if (rescanQueued) {
        rescanQueued = false;
        void get().rescan(false);
      }
    }
  },

  startupRescan: async () => {
    if (!watching) {
      watching = true;
      void onLocalLibraryChanged(() => {
        if (get().scanning) rescanQueued = true;
        else void get().rescan(false);
      }).catch(() => {
        watching = false;
      });
    }
    await get().refresh();
    if (get().library.folders.length === 0) return;
    await get().rescan(false);
  },

  importFolders: async (paths) => {
    let result;
    try {
      result = await localLibraryAddFolders(paths);
    } catch {
      toast("Couldn't import that folder", "error");
      return;
    }
    set({ library: result.lib });
    if (result.added.length === 0) {
      toast("That folder is already in your library");
      return;
    }
    useSettings.getState().setLocalMusicFolder(result.added[0].path);
    await get().scan();
    toast(
      result.added.length === 1 ? `Imported "${result.added[0].name}"` : `Imported ${result.added.length} folders`,
      "success",
    );
  },

  importFromPicker: async () => {
    let dir: string | null;
    try {
      dir = await pickFolder("Choose a music folder");
    } catch {
      toast("Couldn't import that folder", "error");
      return;
    }
    if (dir) await get().importFolders([dir]);
  },

  remove: async (path) => {
    try {
      const library = await localLibraryRemoveFolder(path);
      set({ library, missing: get().missing.filter((item) => item !== path) });
      toast(`Removed from ${APP_NAME}. Files untouched`, "success");
    } catch {
      toast("Couldn't remove the folder", "error");
    }
  },

  rename: async (path, displayName) => {
    try {
      const library = await localLibraryRenameFolder(path, displayName);
      set({ library });
      toast("Renamed", "success");
    } catch {
      toast("Couldn't rename", "error");
    }
  },

  forgetOpened: async (id) => {
    set({ opened: await localLibraryForgetOpened(id) });
  },

  openFiles: async (paths) => {
    let result: LocalOpenResult;
    try {
      result = await localLibraryOpenFiles(paths);
    } catch {
      toast("Couldn't open those files", "error");
      return { tracks: [], folders: [], unplayable: [] };
    }
    if (result.tracks.length > 0) set({ opened: await localLibraryOpened() });
    if (result.unplayable.length > 0) toast(unplayableToast([...new Set(result.unplayable)]), "warning");
    return result;
  },

  editTags: async (id, edits) => {
    const track = await localLibraryEditTags(id, edits);
    const swap = (list: LocalTrack[]) => list.map((item) => (item.id === id ? track : item));
    set((state) => ({
      library: { ...state.library, tracks: swap(state.library.tracks) },
      opened: swap(state.opened),
    }));
    usePlayer.setState((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, ...toTrack(track), album: track.album } : item,
      ),
    }));
    return track;
  },
}));
